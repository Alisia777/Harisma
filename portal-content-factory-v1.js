(function () {
'use strict';
if (window.__QHARISMA_CONTENT_FACTORY_V1__) return;
window.__QHARISMA_CONTENT_FACTORY_V1__ = true;
var VIEW = 'content-factory';
var ROOT_ID = 'view-' + VIEW;
var DATA_URL = 'data/content_factory_june_july_2026.json?v=20260721cf2';
var data = null;
var filters = { search: '', brand: 'all', priority: 'all', match: 'all', sort: 'priority' };
function esc(value) {
return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
});
}
function num(value) {
if (value === null || value === undefined || value === '') return null;
value = Number(value);
return Number.isFinite(value) ? value : null;
}
function int(value) {
value = num(value);
return value == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}
function money(value) {
value = num(value);
if (value == null) return '—';
if (Math.abs(value) >= 1000000) return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value / 1000000) + ' млн ₽';
if (Math.abs(value) >= 1000) return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value / 1000) + ' тыс. ₽';
return int(value) + ' ₽';
}
function pct(value) {
value = num(value);
return value == null ? '—' : new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 }).format(value);
}
function deltaPp(value) {
value = num(value);
return value == null ? '—' : (value > 0 ? '+' : '') + value.toFixed(1).replace('.', ',') + ' п.п.';
}
function deltaPct(value) {
value = num(value);
return value == null ? '—' : (value > 0 ? '+' : '') + new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 }).format(value);
}
function priorityMeta(value) {
return {
x: ['match_required', 'Требует сопоставления', 'Алиас', 0],
h: ['high', 'Высокий', 'Высокий', 1],
m: ['medium', 'Средний', 'Средний', 2],
l: ['low', 'Низкий', 'Низкий', 3]
}[value] || ['low', 'Низкий', 'Низкий', 3];
}
function action(priority) {
return {
high: 'Приоритетно обновить карточку, SEO и первые экраны контента.',
medium: 'Провести точечный аудит контента и органической выдачи.',
low: 'Поддерживать контент и мониторить органику.',
match_required: 'Проверить алиас: служебный SKU не нашёл точного основного артикула.'
}[priority];
}
function hydrate(raw) {
if (!raw || !Array.isArray(raw.r)) throw new Error('Некорректный формат данных');
var items = raw.r.map(function (row, index) {
var meta = priorityMeta(row[16]);
var base = row[1] || '';
var matched = row[7] === 1;
return {
id: 'cf-' + index,
brand: row[0] || '',
baseSku: base,
mainSku: matched ? base : '',
nmId: row[2],
product: row[3] || '',
variantsJune: row[4] || 0,
variantsJuly: row[5] || 0,
uniqueVariants: row[6] || 0,
matchStatus: matched ? 'matched' : 'unmatched',
organicJune: row[8],
organicJuly: row[9],
organicDeltaPp: row[10],
ordersJuneRub: row[11],
ordersJulyRub: row[12],
ordersDailyDelta: row[13],
stockJuly: row[14],
turnoverDaysJuly: row[15],
priority: meta[0],
priorityLabel: meta[1],
priorityShort: meta[2],
priorityRank: meta[3],
contentSkus: String(row[17] || '').split(',').filter(Boolean).map(function (id) {
return 'otz_fbs' + (id === '0' ? '' : id) + '_' + base;
})
};
});
var summary = { total: items.length, matched: 0, high: 0, medium: 0, low: 0, matchRequired: 0, highDrop: 0, highOrders: 0, brands: {} };
items.forEach(function (item) {
if (item.matchStatus === 'matched') summary.matched += 1;
if (item.priority === 'match_required') summary.matchRequired += 1; else summary[item.priority] += 1;
if (item.priority === 'high' && num(item.organicDeltaPp) < 0) summary.highDrop += 1;
if (item.priority === 'high') summary.highOrders += num(item.ordersJulyRub) || 0;
if (!summary.brands[item.brand]) summary.brands[item.brand] = { total: 0, high: 0, matchRequired: 0 };
summary.brands[item.brand].total += 1;
if (item.priority === 'high') summary.brands[item.brand].high += 1;
if (item.priority === 'match_required') summary.brands[item.brand].matchRequired += 1;
});
summary.matchRate = summary.total ? summary.matched / summary.total : 0;
return { updatedAt: raw.u, source: raw.src, period: raw.p, rule: raw.rule, items: items, summary: summary };
}
window.__QHARISMA_CONTENT_FACTORY_HYDRATE__ = hydrate;
function style() {
if (document.querySelector('link[data-cf-style]')) return;
var link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'portal-content-factory-v1.css?v=20260721cf2';
link.setAttribute('data-cf-style', '1');
document.head.appendChild(link);
}
function ensureRoute() {
style();
var button = document.querySelector('.nav-btn[data-view="' + VIEW + '"]');
var nav = document.querySelector('.sidebar .nav') || document.querySelector('nav.nav');
if (!button && nav) {
button = document.createElement('button');
button.type = 'button';
button.className = 'nav-btn';
button.dataset.view = VIEW;
button.innerHTML = '<span>Контент-завод</span><small>SKU · органика · приоритеты</small>';
var after = nav.querySelector('.nav-btn[data-view="designers"]');
if (after) after.insertAdjacentElement('afterend', button); else nav.appendChild(button);
}
var root = document.getElementById(ROOT_ID);
var main = document.querySelector('main.main') || document.querySelector('.main') || document.querySelector('main');
if (!root && main) {
root = document.createElement('section');
root.className = 'view';
root.id = ROOT_ID;
main.appendChild(root);
bind(root);
}
return { button: button, root: root };
}
function activate() {
var route = ensureRoute();
if (!route.button || !route.root) return;
document.querySelectorAll('.nav-btn[data-view]').forEach(function (node) { node.classList.toggle('active', node === route.button); });
document.querySelectorAll('.view').forEach(function (node) { node.classList.toggle('active', node === route.root); });
if (location.hash !== '#content-factory') history.replaceState(null, '', location.pathname + location.search + '#content-factory');
render();
}
function brandsHtml() {
return Object.keys(data.summary.brands).sort(function (a, b) { return a.localeCompare(b, 'ru'); }).map(function (brand) {
var row = data.summary.brands[brand];
return '<button class="cf-brand" data-brand="' + esc(brand) + '"><span><b>' + esc(brand) + '</b><small>' + row.high + ' high · ' + row.matchRequired + ' алиас</small></span><strong>' + row.total + '</strong></button>';
}).join('');
}
function shellHtml() {
var s = data.summary;
return '<div class="cf">' +
'<div class="cf-hero"><section class="cf-card"><div class="cf-kicker">Content operations · ' + esc(data.period) + '</div><h1>Контент-завод</h1><p class="cf-lead">Сопоставление служебных SKU, динамика органики и заказов, остатки и приоритет действий по 56 базовым карточкам.</p><div class="cf-meta"><span>Обновлено 21.07.2026</span><span>' + s.matched + ' из ' + s.total + ' сопоставлено</span><a href="' + esc(data.source) + '" target="_blank" rel="noopener">Источник ↗</a></div></section>' +
'<aside class="cf-card cf-insight"><div class="cf-kicker">Главный сигнал</div><strong>' + s.highDrop + ' из ' + s.high + ' high-priority SKU просели по органике.</strong><p class="cf-note">Начинаем с карточки, SEO и первых экранов — не со среднего показателя портфеля.</p><button class="cf-btn" data-high>Показать High</button></aside></div>' +
'<div class="cf-kpis">' +
'<div class="cf-kpi"><span>Базовых SKU</span><b>' + s.total + '</b><small>в текущем реестре</small></div>' +
'<div class="cf-kpi"><span>Высокий приоритет</span><b class="high">' + s.high + '</b><small>' + s.highDrop + ' со снижением органики</small></div>' +
'<div class="cf-kpi"><span>Сопоставлено</span><b>' + s.matched + ' / ' + s.total + '</b><small>' + pct(s.matchRate) + ' точных связок</small></div>' +
'<div class="cf-kpi"><span>Требуют алиаса</span><b class="match_required">' + s.matchRequired + '</b><small>не найдены в основном реестре</small></div>' +
'<div class="cf-kpi"><span>Заказы в зоне High</span><b>' + money(s.highOrders) + '</b><small>сумма июля</small></div>' +
'</div>' +
'<div class="cf-tools"><input type="search" data-filter="search" placeholder="SKU, товар, nmID…" value="' + esc(filters.search) + '">' +
'<select data-filter="brand"><option value="all">Все бренды</option>' + Object.keys(s.brands).sort(function (a,b){return a.localeCompare(b,'ru');}).map(function (b){return '<option value="'+esc(b)+'">'+esc(b)+'</option>';}).join('') + '</select>' +
'<select data-filter="priority"><option value="all">Все приоритеты</option><option value="match_required">Требует сопоставления</option><option value="high">Высокий</option><option value="medium">Средний</option><option value="low">Низкий</option></select>' +
'<select data-filter="match"><option value="all">Все статусы</option><option value="matched">Сопоставлен</option><option value="unmatched">Не сопоставлен</option></select>' +
'<select data-filter="sort"><option value="priority">По приоритету</option><option value="organic">По падению органики</option><option value="orders">По заказам июля</option><option value="turnover">По оборачиваемости</option></select>' +
'<button class="cf-btn" data-reset>Сбросить</button></div>' +
'<div class="cf-brands">' + brandsHtml() + '</div>' +
'<section class="cf-panel"><div class="cf-head"><div><h2>Очередь обновления</h2><p>Клик по строке открывает служебные SKU и действие.</p></div><span data-count></span></div><div data-results></div></section>' +
'<dialog data-dialog></dialog></div>';
}
function visibleItems() {
var query = filters.search.trim().toLowerCase();
var list = data.items.filter(function (item) {
if (filters.brand !== 'all' && item.brand !== filters.brand) return false;
if (filters.priority !== 'all' && item.priority !== filters.priority) return false;
if (filters.match !== 'all' && item.matchStatus !== filters.match) return false;
if (!query) return true;
return [item.brand, item.baseSku, item.product, item.nmId].concat(item.contentSkus).join(' ').toLowerCase().includes(query);
}).slice();
list.sort(function (a, b) {
if (filters.sort === 'organic') return (num(a.organicDeltaPp) == null ? 999 : a.organicDeltaPp) - (num(b.organicDeltaPp) == null ? 999 : b.organicDeltaPp);
if (filters.sort === 'orders') return (num(b.ordersJulyRub) || 0) - (num(a.ordersJulyRub) || 0);
if (filters.sort === 'turnover') return (num(b.turnoverDaysJuly) || 0) - (num(a.turnoverDaysJuly) || 0);
return a.priorityRank - b.priorityRank || (num(a.organicDeltaPp) == null ? 999 : a.organicDeltaPp) - (num(b.organicDeltaPp) == null ? 999 : b.organicDeltaPp) || (num(b.ordersJulyRub) || 0) - (num(a.ordersJulyRub) || 0);
});
return list;
}
function rowsHtml(items) {
if (!items.length) return '<div class="cf-empty">По выбранным фильтрам ничего не найдено.</div>';
return '<div class="cf-wrap"><table><thead><tr><th>Приоритет</th><th>Бренд / SKU / товар</th><th>Варианты</th><th>Органика</th><th>Заказано</th><th>Остаток / оборот</th><th>Действие</th></tr></thead><tbody>' +
items.map(function (item) {
var od = num(item.organicDeltaPp);
var rd = num(item.ordersDailyDelta);
return '<tr data-open="' + item.id + '"><td><span class="cf-pri ' + item.priority + '">' + esc(item.priorityShort) + '</span></td>' +
'<td><div class="cf-prod"><span class="cf-brandtag">' + esc(item.brand) + '</span><b>' + esc(item.product || 'Основной товар не сопоставлен') + '</b><small>' + esc(item.baseSku) + (item.nmId ? ' · nmID ' + item.nmId : '') + '</small></div></td>' +
'<td><div class="cf-metric"><b>' + item.variantsJune + ' → ' + item.variantsJuly + '</b><small>' + item.uniqueVariants + ' уникальных</small></div></td>' +
'<td><div class="cf-metric"><b>' + pct(item.organicJune) + ' → ' + pct(item.organicJuly) + '</b><small class="' + (od < 0 ? 'neg' : od > 0 ? 'pos' : '') + '">' + deltaPp(od) + '</small></div></td>' +
'<td><div class="cf-metric"><b>' + money(item.ordersJuneRub) + ' → ' + money(item.ordersJulyRub) + '</b><small class="' + (rd < 0 ? 'neg' : rd > 0 ? 'pos' : '') + '">день к дню ' + deltaPct(rd) + '</small></div></td>' +
'<td><div class="cf-metric"><b>' + int(item.stockJuly) + ' шт.</b><small>' + (num(item.turnoverDaysJuly) == null ? '—' : int(item.turnoverDaysJuly) + ' дн.') + '</small></div></td>' +
'<td class="cf-action">' + esc(action(item.priority)) + '</td></tr>';
}).join('') + '</tbody></table></div>';
}
function updateRows() {
var root = document.getElementById(ROOT_ID);
if (!root || !data) return;
var items = visibleItems();
root.querySelector('[data-results]').innerHTML = rowsHtml(items);
root.querySelector('[data-count]').textContent = 'Показано ' + items.length + ' из ' + data.summary.total;
root.querySelectorAll('[data-filter]').forEach(function (control) {
var key = control.dataset.filter;
if (key !== 'search') control.value = filters[key];
});
}
function openDetail(id) {
var root = document.getElementById(ROOT_ID);
var item = data.items.find(function (row) { return row.id === id; });
var dialog = root && root.querySelector('[data-dialog]');
if (!item || !dialog) return;
dialog.innerHTML = '<div class="cf-dialog"><div class="cf-dialog-head"><div><span class="cf-pri ' + item.priority + '">' + esc(item.priorityLabel) + '</span><h3>' + esc(item.product || item.baseSku) + '</h3><p class="cf-note">' + esc(item.brand) + ' · ' + esc(item.baseSku) + (item.nmId ? ' · nmID ' + item.nmId : '') + '</p></div><button class="cf-btn" data-close>Закрыть</button></div>' +
'<div class="cf-grid"><div class="cf-detail"><small>Органика июнь → июль</small><b>' + pct(item.organicJune) + ' → ' + pct(item.organicJuly) + '</b><div>' + deltaPp(item.organicDeltaPp) + '</div></div><div class="cf-detail"><small>Заказано июнь → июль</small><b>' + money(item.ordersJuneRub) + ' → ' + money(item.ordersJulyRub) + '</b><div>' + deltaPct(item.ordersDailyDelta) + '</div></div><div class="cf-detail"><small>Варианты</small><b>' + item.variantsJune + ' → ' + item.variantsJuly + '</b><div>' + item.uniqueVariants + ' уникальных</div></div><div class="cf-detail"><small>Остаток / оборачиваемость</small><b>' + int(item.stockJuly) + ' шт.</b><div>' + (num(item.turnoverDaysJuly) == null ? '—' : int(item.turnoverDaysJuly) + ' дней') + '</div></div></div>' +
'<div class="cf-detail" style="margin-top:10px"><small>Рекомендуемое действие</small><b>' + esc(action(item.priority)) + '</b></div><div style="margin-top:14px"><b>SKU контент-завода · ' + item.contentSkus.length + '</b><div class="cf-tags">' + item.contentSkus.map(function (sku) { return '<code>' + esc(sku) + '</code>'; }).join('') + '</div></div></div>';
dialog.showModal();
}
function render() {
var route = ensureRoute();
if (!route.root) return;
if (!data) {
route.root.innerHTML = '<div class="cf"><div class="cf-card">Загружаем данные контент-завода…</div></div>';
return;
}
route.root.innerHTML = shellHtml();
updateRows();
}
function bind(root) {
if (root.__cfBound) return;
root.__cfBound = true;
root.addEventListener('input', function (event) {
var control = event.target.closest('[data-filter]');
if (!control || control.dataset.filter !== 'search') return;
filters.search = control.value || '';
updateRows();
});
root.addEventListener('change', function (event) {
var control = event.target.closest('[data-filter]');
if (!control) return;
filters[control.dataset.filter] = control.value;
updateRows();
});
root.addEventListener('click', function (event) {
var open = event.target.closest('[data-open]');
if (open) return openDetail(open.dataset.open);
var brand = event.target.closest('[data-brand]');
if (brand) { filters.brand = brand.dataset.brand; updateRows(); return; }
if (event.target.closest('[data-high]')) { filters.priority = 'high'; updateRows(); root.querySelector('.cf-panel').scrollIntoView({ behavior: 'smooth' }); return; }
if (event.target.closest('[data-reset]')) { filters = { search: '', brand: 'all', priority: 'all', match: 'all', sort: 'priority' }; render(); return; }
if (event.target.closest('[data-close]')) root.querySelector('[data-dialog]').close();
});
}
function init() {
ensureRoute();
document.addEventListener('click', function (event) {
var button = event.target.closest('.nav-btn[data-view]');
if (!button) return;
if (button.dataset.view === VIEW) {
event.preventDefault();
event.stopImmediatePropagation();
activate();
} else {
var root = document.getElementById(ROOT_ID);
if (root) root.classList.remove('active');
}
}, true);
fetch(DATA_URL, { cache: 'no-store' }).then(function (response) {
if (!response.ok) throw new Error('HTTP ' + response.status);
return response.json();
}).then(function (raw) {
data = hydrate(raw);
window.__QHARISMA_CONTENT_FACTORY_DATA__ = data;
render();
if (location.hash === '#content-factory') activate();
}).catch(function (error) {
var root = ensureRoute().root;
if (root) root.innerHTML = '<div class="cf"><div class="cf-card"><b class="high">Не удалось загрузить данные</b><p class="cf-note">' + esc(error.message) + '</p></div></div>';
});
if (location.hash === '#content-factory') activate();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
