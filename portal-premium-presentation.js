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

  var MARKETPLACE_STORAGE_KEY = 'altea.portal.marketplace';
  var MARKETPLACE_IDS = ['all', 'wb', 'ozon', 'ym', 'goldapple', 'letu', 'magnit'];
  var MARKETPLACE_TO_INTERNAL = { ym: 'ya' };
  var INTERNAL_TO_MARKETPLACE = { ya: 'ym' };

  Object.assign(ROUTES.dashboard, {
    title: 'Дашборд',
    kicker: 'CEO контур',
    headline: 'Пульс бренда без операционного шума',
    caption: 'Заказы, выкупы, маржа и реклама: сверху итог, ниже площадки и SKU.'
  });
  Object.assign(NAV_BY_ID.dashboard, {
    title: 'Дашборд',
    caption: 'CEO · заказы · маржа · реклама'
  });

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

  function normalizeMarketplace(value) {
    var key = String(value || 'all').trim().toLowerCase();
    if (!key || key === 'undefined' || key === 'null') key = 'all';
    if (key === 'ya' || key === 'yandex' || key === 'yandexmarket' || key === 'yamarket') key = 'ym';
    if (key === 'goldenapple' || key === 'gold-apple' || key === 'gold_apple' || key === 'зя') key = 'goldapple';
    if (key === 'letual' || key === 'letuall' || key === 'летуаль') key = 'letu';
    if (key === 'magnitmarket' || key === 'magnit-market') key = 'magnit';
    return MARKETPLACE_IDS.indexOf(key) >= 0 ? key : 'all';
  }

  function internalPlatform(value) {
    var marketplace = normalizeMarketplace(value);
    return MARKETPLACE_TO_INTERNAL[marketplace] || marketplace;
  }

  function marketplaceFromInternal(value) {
    var key = String(value || 'all').trim().toLowerCase();
    return normalizeMarketplace(INTERNAL_TO_MARKETPLACE[key] || key);
  }

  function readMarketplace() {
    try {
      return normalizeMarketplace(window.localStorage.getItem(MARKETPLACE_STORAGE_KEY));
    } catch (error) {
      return 'all';
    }
  }

  function currentMarketplace() {
    return normalizeMarketplace(
      document.documentElement.getAttribute('data-marketplace')
      || document.body.getAttribute('data-marketplace')
      || readMarketplace()
    );
  }

  function platformMeta(key) {
    var marketplace = normalizeMarketplace(key);
    return PLATFORM[marketplace] || PLATFORM[internalPlatform(marketplace)] || PLATFORM.all;
  }

  function platformStyle(key) {
    var meta = platformMeta(key);
    return '--platform:' + meta.color + ';--platform-rgb:' + meta.rgb + ';--pc:' + meta.color + ';--pc-rgb:' + meta.rgb;
  }

  function routeStyle(route, platform) {
    var meta = platformMeta(platform || currentMarketplace());
    return '--route-accent:' + route.accent + ';--route-rgb:' + route.rgb + ';--platform:' + meta.color + ';--platform-rgb:' + meta.rgb;
  }

  function setMarketplaceVars(element, marketplace) {
    if (!element) return;
    var next = normalizeMarketplace(marketplace);
    var meta = platformMeta(next);
    element.dataset.marketplace = next;
    element.dataset.platform = next;
    element.style.setProperty('--platform', meta.color);
    element.style.setProperty('--platform-rgb', meta.rgb);
    element.style.setProperty('--pc', meta.color);
    element.style.setProperty('--pc-rgb', meta.rgb);
  }

  function syncMarketplaceControls() {
    var active = currentMarketplace();
    Array.prototype.forEach.call(document.querySelectorAll('[data-altea-marketplace]'), function (button) {
      var key = normalizeMarketplace(button.getAttribute('data-altea-marketplace'));
      var selected = key === active;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  function syncGlobalFilterState(marketplace) {
    var s = state();
    if (!s || typeof s !== 'object') return;
    var platform = internalPlatform(marketplace);
    s.filters = s.filters || {};
    s.filters.market = platform;
    s.filters.platform = platform;
    if (s.skuPlanFactFilters) s.skuPlanFactFilters.platform = platform;
    if (s.iuDrrFilters && platform !== 'all') s.iuDrrFilters.platform = platform === 'ym' ? 'ya' : platform;
    if (s.adsFunnelFilters) s.adsFunnelFilters.platform = platform;
    if (window.__ALTEA_EXECUTIVE_FUNNEL_FILTERS__) {
      window.__ALTEA_EXECUTIVE_FUNNEL_FILTERS__.platform = platform;
    }
  }

  function applyMarketplaceToVisibleRoute(marketplace) {
    var active = activeRoute();
    if (!active || premiumRoute(active.id)) return;
    var platform = internalPlatform(marketplace);
    var scopedSelectors = [
      '[data-executive-funnel-platform]',
      '[data-market-filter]',
      '[data-sku-plan-fact-platform-card]',
      '[data-oos-platform-chip]',
      '[data-iu-drr-platform]',
      '[data-ads-platform]',
      '[data-rating-platform]',
      '[data-altea-order-platform]',
      '[data-calendar-platform-chip]',
      '[data-task-platform-filter]'
    ];
    scopedSelectors.some(function (selector) {
      var buttons = Array.prototype.slice.call(active.root.querySelectorAll(selector));
      var target = buttons.find(function (button) {
        var attr = button.getAttribute('data-executive-funnel-platform')
          || button.getAttribute('data-market-filter')
          || button.getAttribute('data-sku-plan-fact-platform-card')
          || button.getAttribute('data-oos-platform-chip')
          || button.getAttribute('data-iu-drr-platform')
          || button.getAttribute('data-ads-platform')
          || button.getAttribute('data-rating-platform')
          || button.getAttribute('data-altea-order-platform')
          || button.getAttribute('data-calendar-platform-chip')
          || button.getAttribute('data-task-platform-filter');
        return marketplaceFromInternal(attr) === marketplace || String(attr || '').toLowerCase() === platform;
      });
      if (target && !target.classList.contains('active') && !target.classList.contains('is-active')) {
        target.click();
        return true;
      }
      return false;
    });
  }

  function applyMarketplace(value, options) {
    var opts = options || {};
    var next = normalizeMarketplace(value);
    setMarketplaceVars(document.documentElement, next);
    setMarketplaceVars(document.body, next);
    setMarketplaceVars(document.getElementById('altea-premium-app'), next);
    if (opts.persist !== false) {
      try {
        window.localStorage.setItem(MARKETPLACE_STORAGE_KEY, next);
      } catch (error) {}
    }
    syncGlobalFilterState(next);
    syncMarketplaceControls();
    if (!opts.silent) {
      var detail = { marketplace: next, platform: next, internalPlatform: internalPlatform(next) };
      window.dispatchEvent(new CustomEvent('altea:marketplacechange', { detail: detail }));
      window.dispatchEvent(new CustomEvent('altea:platformchange', { detail: detail }));
    }
    if (opts.rerender) {
      applyMarketplaceToVisibleRoute(next);
      if (typeof window.rerenderCurrentView === 'function') window.rerenderCurrentView();
      else if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
      scheduleRender(80);
    }
    return next;
  }

  function marketplaceButtonsHtml() {
    return MARKETPLACE_IDS.map(function (key) {
      var meta = platformMeta(key);
      return [
        '<button type="button" class="altea-marketplace-chip" data-altea-marketplace="' + escapeHtml(key) + '" aria-pressed="false" style="' + platformStyle(key) + '">',
        '<i aria-hidden="true"></i><span>' + escapeHtml(meta.label) + '</span>',
        '</button>'
      ].join('');
    }).join('');
  }

  function marketplaceSelectorHtml(extraClass, kind) {
    return '<div class="altea-global-marketplace ' + escapeHtml(extraClass || '') + '" data-altea-marketplace-selector="' + escapeHtml(kind || 'premium') + '">' + marketplaceButtonsHtml() + '</div>';
  }

  function ensureLegacyMarketplaceSelector() {
    if (document.querySelector('[data-altea-marketplace-selector="legacy"]')) return;
    var actions = document.querySelector('.app-shell .top-actions') || document.querySelector('.top-actions');
    if (!actions) return;
    var node = document.createElement('div');
    node.className = 'altea-global-marketplace altea-global-marketplace--legacy';
    node.setAttribute('data-altea-marketplace-selector', 'legacy');
    node.innerHTML = marketplaceButtonsHtml();
    actions.insertBefore(node, actions.firstChild);
    syncMarketplaceControls();
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

  function dashboardMonthKey(s) {
    var dashboard = s.dashboard || {};
    var activeMonth = dashboard.companyPlan && dashboard.companyPlan.activeMonth || {};
    var month = activeMonth.monthKey || activeMonth.key || dashboard.company_plan_month_key || dashboard.monthKey || '';
    if (month) return String(month).slice(0, 7);
    var asOf = dashboard.asOfDate || dashboard.dataFreshness && dashboard.dataFreshness.asOfDate || s.platformTrends && s.platformTrends.latestMarketplaceDate || '';
    return String(asOf || '').slice(0, 7);
  }

  function dashboardSeriesInMonth(series, monthKey) {
    return (Array.isArray(series) ? series : []).filter(function (row) {
      var date = String(row.date || row.label || '');
      return !monthKey || date.indexOf(monthKey) === 0;
    });
  }

  function rowFirstNumber(row, fields) {
    for (var index = 0; index < fields.length; index += 1) {
      var value = Number(row && row[fields[index]]);
      if (Number.isFinite(value)) return value;
    }
    return 0;
  }

  function dashboardAdsByPlatform(s) {
    var map = {};
    var rows = s.adsSummary && Array.isArray(s.adsSummary.platforms) ? s.adsSummary.platforms : [];
    rows.forEach(function (row) {
      var key = marketplaceFromInternal(row.platformKey || row.platform || row.key || 'all');
      map[key] = row;
    });
    var summedAll = rows.filter(function (row) {
        return marketplaceFromInternal(row.platformKey || row.platform || row.key || '') !== 'all';
      }).reduce(function (acc, row) {
        acc.spend += finite(row.spend);
        acc.orders += finite(row.orders);
        acc.revenue += finite(row.revenue);
        return acc;
      }, { key: 'all', platformKey: 'all', label: 'Все', spend: 0, orders: 0, revenue: 0 });
    if (!map.all || !finite(map.all.spend)) map.all = summedAll;
    return map;
  }

  function aggregateTrendPlatform(platform, monthKey) {
    var key = marketplaceFromInternal(platform.platformKey || platform.platform || platform.key || 'all');
    var rows = dashboardSeriesInMonth(platform.series, monthKey);
    var revenue = rows.reduce(function (sum, row) { return sum + rowFirstNumber(row, ['revenue', 'factRevenue', 'financeTurnover']); }, 0);
    var units = rows.reduce(function (sum, row) { return sum + rowFirstNumber(row, ['units', 'ordersUnits', 'factUnits']); }, 0);
    var margin = rows.reduce(function (sum, row) { return sum + rowFirstNumber(row, ['estimatedMargin', 'financialResult', 'marginRub']); }, 0);
    return {
      platform: key,
      label: platform.label || platformMeta(key).label,
      revenue: revenue,
      units: units,
      marginRub: margin,
      marginPct: revenue > 0 ? margin / revenue : null,
      series: rows
    };
  }

  function dashboardIuPlatformRows(s, monthKey) {
    var daily = Array.isArray(s.iuDrrSummary && s.iuDrrSummary.daily) ? s.iuDrrSummary.daily : [];
    var rows = dashboardSeriesInMonth(daily, monthKey);
    function build(key, label, fields) {
      var revenue = rows.reduce(function (sum, row) { return sum + rowFirstNumber(row, fields.revenue); }, 0);
      var units = rows.reduce(function (sum, row) { return sum + rowFirstNumber(row, fields.units); }, 0);
      var adSpend = rows.reduce(function (sum, row) { return sum + rowFirstNumber(row, fields.adSpend); }, 0);
      var plan = rows.reduce(function (sum, row) { return sum + rowFirstNumber(row, fields.plan); }, 0);
      return {
        platform: key,
        label: label,
        revenue: revenue,
        units: units,
        marginRub: 0,
        marginPct: null,
        adSpend: adSpend,
        adRevenue: 0,
        adOrders: 0,
        drr: revenue > 0 ? adSpend / revenue : null,
        romi: null,
        plan: plan,
        completion: plan > 0 ? revenue / plan : null,
        series: rows.map(function (row) {
          return {
            date: row.date,
            label: row.period || row.date,
            revenue: rowFirstNumber(row, fields.revenue),
            units: rowFirstNumber(row, fields.units),
            adSpend: rowFirstNumber(row, fields.adSpend)
          };
        })
      };
    }
    return [
      build('wb', 'WB', {
        revenue: ['revenueWb', 'wbIuFactRevenueGross', 'ordersRevenueWb'],
        units: ['unitsWb'],
        adSpend: ['spendFact', 'wbApiSpendFact', 'wbIuFactAdsGross'],
        plan: ['targetRevenueWb', 'selectedDailyRevenueWb', 'contractTargetRevenueWb']
      }),
      build('ozon', 'Ozon', {
        revenue: ['revenueOzon', 'ozonGmv', 'ozonGmvGross'],
        units: ['deliveredUnitsOzon', 'unitsOzon', 'ordersUnitsOzon'],
        adSpend: ['spendFactOzon', 'ozonDrrSpendGross'],
        plan: ['targetRevenueOzon']
      }),
      build('ym', 'Я.Маркет', {
        revenue: ['revenueYandex', 'ordersRevenueYandex'],
        units: ['deliveredUnitsYandex', 'unitsYandex', 'ordersUnitsYandex'],
        adSpend: ['spendFactYandex'],
        plan: ['targetRevenueYandex']
      })
    ].filter(function (row) { return finite(row.revenue) || finite(row.units) || finite(row.adSpend); });
  }

  function dashboardSkuRows(s, selectedMarketplace, monthKey) {
    var selected = normalizeMarketplace(selectedMarketplace);
    var rows = [];
    var smart = s.smartPriceOverlay && s.smartPriceOverlay.platforms || {};
    var priceSupport = s.priceWorkbenchSupport && s.priceWorkbenchSupport.platforms || {};
    function collectSmart(platformKey) {
      var platform = smart[internalPlatform(platformKey)] || smart[platformKey];
      (platform && Array.isArray(platform.rows) ? platform.rows : []).forEach(function (row) {
        var daily = dashboardSeriesInMonth(row.daily, monthKey);
        var revenue = daily.reduce(function (sum, item) { return sum + rowFirstNumber(item, ['revenue']); }, 0);
        var units = daily.reduce(function (sum, item) { return sum + rowFirstNumber(item, ['ordersUnits', 'units']); }, 0);
        rows.push({
          article: row.article || row.articleKey,
          owner: row.owner || '—',
          platform: platformKey,
          revenue: revenue,
          units: units,
          marginPct: ratio(row.marginPct || row.estimatedMarginPct || row.marginTotalPct),
          status: row.status || ''
        });
      });
    }
    function collectSupport(platformKey) {
      var platform = priceSupport[internalPlatform(platformKey)] || priceSupport[platformKey];
      var supportRows = platform && platform.rows || {};
      Object.keys(supportRows || {}).forEach(function (articleKey) {
        if (!articleKey || articleKey === '0' || /^total|итого$/i.test(articleKey)) return;
        var row = supportRows[articleKey] || {};
        var month = (row.actualMonths || []).concat(row.planMonths || []).find(function (item) { return item.monthKey === monthKey; }) || {};
        rows.push({
          article: row.article || row.name || articleKey,
          owner: row.owner || '—',
          platform: platformKey,
          revenue: finite(month.revenue),
          units: finite(month.units),
          marginPct: ratio(month.marginPct || row.marginPct),
          status: row.status || ''
        });
      });
    }
    var platformKeys = selected === 'all' ? ['wb', 'ozon', 'ym'] : [selected];
    platformKeys.forEach(function (platformKey) {
      collectSmart(platformKey);
      collectSupport(platformKey);
    });
    var byArticle = {};
    rows.forEach(function (row) {
      var key = row.platform + ':' + String(row.article || '').toLowerCase();
      if (!byArticle[key] || finite(row.revenue) > finite(byArticle[key].revenue)) byArticle[key] = row;
    });
    return Object.keys(byArticle).map(function (key) { return byArticle[key]; })
      .filter(function (row) { return finite(row.revenue) || finite(row.units); })
      .sort(function (left, right) { return finite(right.revenue) - finite(left.revenue); })
      .slice(0, 10);
  }

  function buildDashboardModel() {
    var s = state();
    var dashboard = s.dashboard || {};
    var brand = Array.isArray(dashboard.brandSummary) ? dashboard.brandSummary[0] || {} : {};
    var activeMonth = dashboard.companyPlan && dashboard.companyPlan.activeMonth || {};
    var monthKey = dashboardMonthKey(s);
    var selected = currentMarketplace();
    var adsByPlatform = dashboardAdsByPlatform(s);
    var trendPlatforms = s.platformTrends && Array.isArray(s.platformTrends.platforms) ? s.platformTrends.platforms : [];
    var iuPlatformRows = dashboardIuPlatformRows(s, monthKey);
    var platformRows = trendPlatforms
      .map(function (platform) { return aggregateTrendPlatform(platform, monthKey); })
      .filter(function (row) { return row.platform !== 'all'; })
      .map(function (row) {
        var ad = adsByPlatform[row.platform] || {};
        row.adSpend = finite(ad.spend);
        row.adOrders = finite(ad.orders);
        row.adRevenue = finite(ad.revenue);
        row.drr = row.revenue > 0 ? row.adSpend / row.revenue : null;
        row.romi = row.adSpend > 0 ? (row.adRevenue - row.adSpend) / row.adSpend : null;
        return row;
      });
    if (!platformRows.length) {
      platformRows = iuPlatformRows;
    } else {
      iuPlatformRows.forEach(function (iuRow) {
        var existing = platformRows.find(function (row) { return row.platform === iuRow.platform; });
        if (!existing) {
          platformRows.push(iuRow);
          return;
        }
        if (!finite(existing.revenue) && finite(iuRow.revenue)) existing.revenue = finite(iuRow.revenue);
        if (!finite(existing.units) && finite(iuRow.units)) existing.units = finite(iuRow.units);
        if (!finite(existing.adSpend) && finite(iuRow.adSpend)) existing.adSpend = finite(iuRow.adSpend);
        if (!existing.series || !existing.series.length) existing.series = iuRow.series || [];
        existing.drr = existing.revenue > 0 ? finite(existing.adSpend) / existing.revenue : existing.drr;
      });
    }
    var allTrend = trendPlatforms.map(function (platform) { return aggregateTrendPlatform(platform, monthKey); }).find(function (row) { return row.platform === 'all'; });
    var visiblePlatformRows = selected === 'all'
      ? platformRows
      : platformRows.filter(function (row) { return row.platform === selected; });
    var adsTotal = adsByPlatform[selected] || adsByPlatform.all || {};
    var total = visiblePlatformRows.reduce(function (acc, row) {
      acc.revenue += finite(row.revenue);
      acc.units += finite(row.units);
      acc.marginRub += finite(row.marginRub);
      acc.adSpend += finite(row.adSpend);
      acc.adRevenue += finite(row.adRevenue);
      return acc;
    }, { revenue: 0, units: 0, marginRub: 0, adSpend: 0, adRevenue: 0 });
    if (selected === 'all' && allTrend && finite(allTrend.revenue)) {
      total.revenue = finite(brand.company_fact_revenue_to_date || brand.fact_revenue_to_date || allTrend.revenue);
      total.units = finite(brand.fact_units_to_date || allTrend.units);
      total.marginRub = finite(allTrend.marginRub);
      total.adSpend = finite(adsTotal.spend);
      total.adRevenue = finite(adsTotal.revenue);
    }
    if (selected === 'all') {
      var brandRevenue = finite(brand.company_fact_revenue_to_date || brand.fact_revenue_to_date || dashboard.company_fact_revenue_to_date);
      var brandUnits = finite(brand.fact_units_to_date);
      if (brandRevenue) total.revenue = brandRevenue;
      if (brandUnits) total.units = brandUnits;
      if (finite(adsTotal.spend)) total.adSpend = finite(adsTotal.spend);
      if (finite(adsTotal.revenue)) total.adRevenue = finite(adsTotal.revenue);
    }
    total.plan = selected === 'all'
      ? finite(activeMonth.planRevenueToDate || brand.company_plan_to_date_revenue || brand.plan_to_date_revenue)
      : 0;
    total.completion = total.plan > 0 ? total.revenue / total.plan : null;
    total.marginPct = total.revenue > 0 && total.marginRub > 0 ? total.marginRub / total.revenue : null;
    total.drr = total.revenue > 0 ? total.adSpend / total.revenue : null;
    total.romi = total.adSpend > 0 ? (total.adRevenue - total.adSpend) / total.adSpend : null;
    var leaderboard = s.productLeaderboard && s.productLeaderboard.summary || {};
    var orders = finite(total.units) || finite(adsTotal.orders) || finite(leaderboard.orders);
    var buys = finite(total.units);
    var buyoutPct = orders > 0 && buys > 0 && buys <= orders ? buys / orders : null;
    if (selected === 'wb' && finite(leaderboard.orders) && finite(leaderboard.buys)) {
      orders = finite(leaderboard.orders);
      buys = finite(leaderboard.buys);
      buyoutPct = orders > 0 ? buys / orders : null;
    }
    return {
      generatedAt: dashboard.generatedAt || '',
      asOf: dashboard.asOfDate || dashboard.dataFreshness && dashboard.dataFreshness.asOfDate || s.platformTrends && s.platformTrends.latestMarketplaceDate || '',
      monthKey: monthKey,
      selected: selected,
      total: total,
      orders: orders,
      buys: buys,
      buyoutPct: buyoutPct,
      platformRows: visiblePlatformRows,
      allPlatformRows: platformRows,
      skuRows: dashboardSkuRows(s, selected, monthKey),
      dailyRevenue: (selected === 'all'
        ? (allTrend && allTrend.series || [])
        : (visiblePlatformRows[0] && visiblePlatformRows[0].series || [])
      ).map(function (row) { return rowFirstNumber(row, ['revenue', 'factRevenue', 'financeTurnover']); })
    };
  }

  function dashboardPlatformCards(model) {
    var rows = model.allPlatformRows || [];
    return '<div class="grid g6 section-gap ceo-platform-grid">' + rows.map(function (row) {
      return metric(
        row.label || platformMeta(row.platform).label,
        money(row.revenue),
        'маржа ' + pct(row.marginPct) + ' · ДРР ' + pct(row.drr),
        row.revenue && model.total.revenue ? row.revenue / model.total.revenue * 100 : 4,
        'platform-metric platform-card ceo-platform-card' + (model.selected === row.platform ? ' is-selected' : ''),
        platformStyle(row.platform)
      );
    }).join('') + '</div>';
  }

  function dashboardSkuTable(model) {
    var rows = model.skuRows || [];
    if (!rows.length) return panel('SKU детализация', '<div class="premium-empty">По выбранной площадке нет строк SKU в рабочем срезе.</div>', 'panel-pad section-gap');
    return panel('SKU детализация', [
      '<div class="premium-table-wrap ceo-table-wrap"><table class="premium-table ceo-table">',
      '<thead><tr><th>SKU</th><th>Площадка</th><th>Owner</th><th>Выручка</th><th>Шт.</th><th>Маржа</th><th>Статус</th></tr></thead>',
      '<tbody>',
      rows.map(function (row) {
        return [
          '<tr>',
          '<td><strong>' + escapeHtml(row.article || '—') + '</strong></td>',
          '<td><span class="platform-pill" style="' + platformStyle(row.platform) + '"><i></i>' + escapeHtml(platformMeta(row.platform).label) + '</span></td>',
          '<td>' + escapeHtml(row.owner || '—') + '</td>',
          '<td>' + money(row.revenue) + '</td>',
          '<td>' + int(row.units) + '</td>',
          '<td>' + pct(row.marginPct) + '</td>',
          '<td>' + escapeHtml(row.status || '—') + '</td>',
          '</tr>'
        ].join('');
      }).join(''),
      '</tbody></table></div>'
    ].join(''), 'panel-pad section-gap', rows.length + ' строк');
  }

  function renderDashboard(root) {
    var route = ROUTES.dashboard;
    var model = buildDashboardModel();
    var stage = ensureStage(route.id);
    var signature = JSON.stringify({
      route: route.id,
      selected: model.selected,
      generatedAt: model.generatedAt,
      asOf: model.asOf,
      total: model.total,
      orders: model.orders,
      buys: model.buys,
      platforms: model.allPlatformRows.map(function (row) { return [row.platform, row.revenue, row.adSpend, row.marginRub]; }),
      sku: model.skuRows.map(function (row) { return [row.article, row.platform, row.revenue, row.units]; })
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
    var selectedLabel = platformMeta(model.selected).label;
    var total = model.total || {};
    var marginText = total.marginRub > 0 ? money(total.marginRub) : '—';
    var marginHint = total.marginPct == null ? 'маржинальный источник не опубликован' : pct(total.marginPct) + ' от выручки ' + money(total.revenue);
    var buyoutHint = model.buyoutPct == null ? 'факт продаж/выкупов' : 'выкуп ' + pct(model.buyoutPct);
    var kpis = [
      metric('Заказы', int(model.orders || total.units), 'контур ' + selectedLabel + ' · источник текущих данных', model.orders ? 100 : 8, 'ceo-kpi'),
      metric('Выкупы', int(model.buys || total.units), buyoutHint, model.buyoutPct == null ? 18 : clampPct(model.buyoutPct), 'ceo-kpi'),
      metric('Маржа', marginText, marginHint, total.marginPct == null ? 10 : clampPct(total.marginPct), 'ceo-kpi'),
      metric('Реклама', money(total.adSpend), 'ДРР ' + pct(total.drr) + ' · ROMI ' + pct(total.romi), clampPct(total.drr), 'ceo-kpi')
    ].join('');
    var focusRows = [
      ['Контур', selectedLabel, model.monthKey || 'месяц'],
      ['Факт выручки', money(total.revenue), model.asOf || 'срез'],
      ['План к дате', total.plan ? money(total.plan) : 'по площадке без общего плана', total.completion == null ? '—' : pct(total.completion)],
      ['Сборка', model.generatedAt || '—', 'данные']
    ];
    stage.innerHTML = [
      '<section class="altea-premium-route altea-premium-route--dashboard altea-ceo-dashboard" style="' + routeStyle(route, model.selected) + '">',
      '<div class="premium-route-body">',
      head(route, '<button class="btn" type="button" data-premium-navigate="iu-drr">ИУ / ДРР</button><button class="btn primary" type="button" data-premium-navigate="sku-plan-fact">План-факт SKU</button>'),
      '<section class="panel hero route-glow ceo-hero"><div class="hero-grid"><div class="hero-copy"><div class="micro">CEO · ' + escapeHtml(selectedLabel) + '</div><h2>' + escapeHtml(money(total.revenue)) + '</h2><p>Продажи, выкупы, маржа и реклама собраны в одном порядке. Операционные задачи вынесены в свои вкладки.</p><div class="hero-number"><div class="value lg">' + escapeHtml(total.completion == null ? pct(total.marginPct) : pct(total.completion)) + '</div><small>' + escapeHtml(total.completion == null ? 'маржа' : 'выполнение плана') + '</small></div></div><div class="hero-orbit"><div class="core">' + escapeHtml(pct(total.drr)) + '</div></div></div></section>',
      '<div class="grid g4 section-gap ceo-kpi-grid">' + kpis + '</div>',
      '<div class="grid g2 section-gap">',
      panel('Динамика выручки', chart(model.dailyRevenue), 'panel-pad ceo-chart-panel'),
      panel('Срез данных', list(focusRows), 'panel-pad platform-focus', model.asOf || 'сейчас'),
      '</div>',
      dashboardPlatformCards(model),
      dashboardSkuTable(model),
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

  function managedRoute(routeId) {
    return !!NAV_BY_ID[routeId];
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
      marketplaceSelectorHtml('altea-global-marketplace--premium', 'premium'),
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
    ensureLegacyMarketplaceSelector();
    var shouldShow = managedRoute(activeId) && !document.body.classList.contains('portal-auth-locked');
    shell.hidden = !shouldShow;
    document.body.classList.toggle('altea-premium-app-active', shouldShow);
    if (!shouldShow) return;
    setMarketplaceVars(shell, currentMarketplace());
    syncMarketplaceControls();
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
    Array.prototype.forEach.call(document.querySelectorAll('[data-premium-stage]'), function (stage) {
      stage.hidden = stage.dataset.premiumStage !== activeId;
    });
    syncShell(activeId);
  }

  function attachLegacyRouteToShell(active) {
    if (!active || !managedRoute(active.id) || premiumRoute(active.id)) return;
    var stage = ensureStage(active.id);
    stage.classList.add('altea-premium-route-stage--legacy');
    if (active.root.parentNode !== stage) stage.appendChild(active.root);
    active.root.dataset.premiumRoute = active.id;
    stage.dataset.premiumSignature = active.id + ':' + (active.root.dataset.renderSignature || active.root.childElementCount || 0);
    syncStageVisibility(active.id);
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
      attachLegacyRouteToShell(active);
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
    if (!active) {
      syncShell(active ? active.id : '');
      return;
    }
    if (!premiumRoute(active.id)) {
      attachLegacyRouteToShell(active);
      return;
    }
    var stage = ensureStage(active.id);
    var premium = stage.querySelector('.altea-premium-route');
    var hasLegacy = Array.prototype.some.call(active.root.children || [], function (child) {
      return !child.classList || !child.classList.contains('altea-premium-route');
    });
    if (!premium || hasLegacy || stage.hidden) renderActive();
    else renderActive();
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
      var marketplace = event.target && event.target.closest && event.target.closest('[data-altea-marketplace]');
      if (marketplace) {
        event.preventDefault();
        applyMarketplace(marketplace.getAttribute('data-altea-marketplace') || 'all', { persist: true, rerender: true });
        return;
      }
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
    window.addEventListener('altea:marketplacechange', function () { scheduleRender(40); });
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
    applyMarketplace(readMarketplace(), { persist: false, rerender: false, silent: true });
    ensureLegacyMarketplaceSelector();
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
    scheduleRender: scheduleRender,
    applyMarketplace: applyMarketplace,
    currentMarketplace: currentMarketplace
  };
})();
