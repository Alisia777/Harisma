(function () {
  if (window.__ALTEA_EXECUTIVE_LITE_GUARD_20260516_EXECLEAN15__) return;
  window.__ALTEA_EXECUTIVE_LITE_GUARD_20260516_EXECLEAN12__ = true;
  window.__ALTEA_EXECUTIVE_LITE_GUARD_20260516_EXECLEAN13__ = true;
  window.__ALTEA_EXECUTIVE_LITE_GUARD_20260516_EXECLEAN14__ = true;
  window.__ALTEA_EXECUTIVE_LITE_GUARD_20260516_EXECLEAN15__ = true;

  const VERSION = '20260516execlean15';
  const PLATFORM_KEYS = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'product', 'cross'];
  const PLATFORM_META = {
    all: { label: 'Все', title: 'Все контуры' },
    wb: { label: 'WB', title: 'РОП WB' },
    ozon: { label: 'Ozon', title: 'РОП Ozon' },
    ya: { label: 'Я.Маркет', title: 'Яндекс Маркет' },
    goldapple: { label: 'ЗЯ', title: 'Золотое яблоко' },
    letu: { label: "Л'Этуаль", title: "Л'Этуаль" },
    magnit: { label: 'Магнит', title: 'Магнит Маркет' },
    product: { label: 'Продукт', title: 'Продукт / новинки' },
    cross: { label: 'Общее', title: 'Общий контур' }
  };

  const RETURN_TEMPLATES = [
    ['calc', 'Нет расчета', 'Вернуть в работу: не хватает расчета, цифр или подтверждения по влиянию.'],
    ['proof', 'Нет подтверждения', 'Вернуть в работу: нужен скрин, ссылка, файл или другой подтверждающий материал.'],
    ['result', 'Не ясен итог', 'Вернуть в работу: не понятно, что сделано и какой следующий шаг.'],
    ['owner', 'Не тот ответственный', 'Вернуть в работу: уточнить ответственного и переназначить задачу.']
  ];

  let scheduled = false;
  let rendering = false;
  let observer = null;
  let renderApi = null;
  let selectedPlatform = 'all';
  let selectedTaskId = '';
  let actionMessage = '';
  let composerOpen = false;
  let composerMessage = '';
  let selectedQueueFilter = 'review';

  function appState() {
    return window.__alteaAppState || window.state || {};
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function fmt(value) {
    return new Intl.NumberFormat('ru-RU').format(Number(value) || 0);
  }

  function badge(text, tone) {
    return `<span class="badge ${tone || ''}">${escapeHtml(text)}</span>`;
  }

  function focusWorkbench() {
    window.requestAnimationFrame(() => {
      const workbench = document.querySelector('[data-executive-lite-workbench]');
      if (workbench) workbench.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function dueDefault() {
    try {
      if (typeof window.plusDays === 'function') return window.plusDays(3);
      if (typeof plusDays === 'function') return plusDays(3);
    } catch {}
    const date = new Date();
    date.setDate(date.getDate() + 3);
    return date.toISOString().slice(0, 10);
  }

  function fmtDate(value) {
    const date = new Date(value || '');
    if (!Number.isFinite(date.getTime())) return String(value || '—');
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function activeTasks() {
    try {
      if (typeof window.getControlSnapshot === 'function') {
        const snapshot = window.getControlSnapshot();
        if (Array.isArray(snapshot?.active)) return snapshot.active;
      }
    } catch {}

    const state = appState();
    const tasks = state.storage?.tasks || state.tasks || [];
    return Array.isArray(tasks)
      ? tasks.filter((task) => !['done', 'cancelled'].includes(String(task?.status || '')))
      : [];
  }

  function skuFor(task) {
    try {
      return typeof window.getSku === 'function' ? window.getSku(task?.articleKey) : null;
    } catch {
      return null;
    }
  }

  function platformKey(task) {
    const sku = skuFor(task);
    try {
      if (typeof window.controlWorkstreamKey === 'function') {
        const key = window.controlWorkstreamKey(task, sku);
        if (PLATFORM_META[key]) return key;
      }
    } catch {}

    const raw = String(task?.platform || sku?.platform || sku?.marketplace || '').toLowerCase();
    if (raw.includes('ozon')) return 'ozon';
    if (raw.includes('wb') || raw.includes('wild')) return 'wb';
    if (raw.includes('yandex') || raw.includes('янд') || raw.includes('ya')) return 'ya';
    if (raw.includes('gold') || raw.includes('золот')) return 'goldapple';
    if (raw.includes('лет') || raw.includes('letu')) return 'letu';
    if (raw.includes('magnit') || raw.includes('магнит')) return 'magnit';
    if (raw.includes('product') || raw.includes('новин')) return 'product';
    return task?.articleKey ? 'product' : 'cross';
  }

  function isOverdue(task) {
    try {
      if (typeof window.isTaskOverdue === 'function') return Boolean(window.isTaskOverdue(task));
    } catch {}
    if (!task?.due) return false;
    const due = new Date(`${task.due}T23:59:59`);
    return Number.isFinite(due.getTime()) && due < new Date();
  }

  function taskTitle(task) {
    return task?.title || task?.entityLabel || task?.articleKey || 'Задача';
  }

  function taskOwner(task) {
    return task?.owner || 'без owner';
  }

  function taskId(task) {
    return String(task?.id || '').trim();
  }

  function statusText(task) {
    const status = String(task?.status || 'new');
    if (status === 'waiting_rop') return 'Ждет РОПа';
    if (status === 'waiting_decision') return 'Ждет финал';
    if (status === 'in_progress') return 'В работе';
    if (status === 'waiting_team') return 'У команды';
    if (status === 'done') return 'Закрыта';
    if (status === 'cancelled') return 'Отменена';
    return 'Новая';
  }

  function taskPriorityText(task) {
    if (task?.priority === 'critical') return 'Критично';
    if (task?.priority === 'high') return 'Высокий';
    if (task?.priority === 'low') return 'Низкий';
    return 'Средний';
  }

  function taskQueueTone(task) {
    if (isOverdue(task) || task?.priority === 'critical') return 'danger';
    if (task?.status === 'waiting_decision') return 'warn';
    if (task?.status === 'waiting_rop') return 'info';
    return 'ok';
  }

  function focusTasks(tasks) {
    return tasks
      .filter((task) => isOverdue(task) || task?.priority === 'critical' || task?.status === 'waiting_decision' || task?.status === 'waiting_rop' || !task?.owner)
      .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || Number(b?.priority === 'critical') - Number(a?.priority === 'critical'));
  }

  function reviewTasks(tasks) {
    return tasks
      .filter((task) => task?.status === 'waiting_rop' || task?.status === 'waiting_decision')
      .sort((left, right) => {
        const stage = (task) => task?.status === 'waiting_decision' ? 2 : 1;
        return stage(right) - stage(left)
          || taskRiskScore(right) - taskRiskScore(left)
          || String(left?.due || '9999-12-31').localeCompare(String(right?.due || '9999-12-31'));
      });
  }

  function queueCounts(tasks) {
    return {
      review: reviewTasks(tasks).length,
      new: tasks.filter((task) => String(task?.status || '') === 'new').length,
      overdue: tasks.filter(isOverdue).length,
      all: tasks.length
    };
  }

  function queueItems(tasks, filterKey) {
    const key = ['review', 'new', 'overdue', 'all'].includes(filterKey) ? filterKey : 'review';
    if (key === 'review') return reviewTasks(tasks);
    if (key === 'new') {
      return tasks
        .filter((task) => String(task?.status || '') === 'new')
        .sort((left, right) => taskRiskScore(right) - taskRiskScore(left) || String(left?.due || '9999-12-31').localeCompare(String(right?.due || '9999-12-31')));
    }
    if (key === 'overdue') {
      return tasks
        .filter(isOverdue)
        .sort((left, right) => taskRiskScore(right) - taskRiskScore(left) || String(left?.due || '9999-12-31').localeCompare(String(right?.due || '9999-12-31')));
    }
    return tasks
      .slice()
      .sort((left, right) => taskRiskScore(right) - taskRiskScore(left) || String(left?.due || '9999-12-31').localeCompare(String(right?.due || '9999-12-31')));
  }

  function filterLabel(filterKey) {
    if (filterKey === 'new') return 'новые';
    if (filterKey === 'overdue') return 'просроченные';
    if (filterKey === 'all') return 'все активные';
    return 'на приемке';
  }

  function queueFilterBar(counts) {
    const filters = [
      ['review', 'На приемке', counts.review],
      ['new', 'Новые', counts.new],
      ['overdue', 'Просроченные', counts.overdue],
      ['all', 'Все', counts.all]
    ];
    return `
      <div class="executive-lite-filterbar" role="group" aria-label="Фильтр задач руководителя">
        ${filters.map(([key, label, count]) => `
          <button class="${selectedQueueFilter === key ? 'is-active' : ''}" type="button" data-executive-lite-filter="${escapeHtml(key)}">
            <span>${escapeHtml(label)}</span><b>${fmt(count)}</b>
          </button>
        `).join('')}
      </div>`;
  }

  function taskMetaLine(task) {
    const sku = skuFor(task);
    const parts = [
      taskOwner(task),
      task?.due || 'без срока',
      (PLATFORM_META[platformKey(task)] || PLATFORM_META.cross).label
    ];
    if (sku?.name || task?.entityLabel) parts.push(sku?.name || task.entityLabel);
    return parts.filter(Boolean).join(' · ');
  }

  function rowFor(key, tasks) {
    const items = key === 'all' ? tasks : tasks.filter((task) => platformKey(task) === key);
    const overdue = items.filter(isOverdue);
    const critical = items.filter((task) => task?.priority === 'critical');
    const waitingRop = items.filter((task) => task?.status === 'waiting_rop');
    const waitingFinal = items.filter((task) => task?.status === 'waiting_decision');
    const noOwner = items.filter((task) => !task?.owner);
    const risk = overdue.length * 4 + critical.length * 3 + waitingFinal.length * 2 + waitingRop.length + noOwner.length;
    return { key, items, overdue, critical, waitingRop, waitingFinal, noOwner, risk };
  }

  function dataSignature(tasks) {
    return tasks.map((task) => [
      task?.id || task?.articleKey || '',
      task?.status || '',
      task?.priority || '',
      task?.owner || '',
      task?.due || '',
      task?.platform || ''
    ].join(':')).sort().join('|');
  }

  function platformCard(row) {
    const meta = PLATFORM_META[row.key] || PLATFORM_META.cross;
    const tone = row.overdue.length || row.critical.length ? 'danger'
      : row.waitingFinal.length || row.noOwner.length ? 'warn'
        : row.waitingRop.length ? 'info'
          : row.items.length ? 'info' : 'ok';
    const status = row.overdue.length ? `${fmt(row.overdue.length)} проср.`
      : row.critical.length ? `${fmt(row.critical.length)} крит.`
        : row.waitingFinal.length ? `${fmt(row.waitingFinal.length)} финал`
          : row.waitingRop.length ? `${fmt(row.waitingRop.length)} у РОПа`
            : row.items.length ? `${fmt(row.items.length)} актив.` : 'чисто';

    const selected = selectedPlatform === row.key;
    return `
      <button class="executive-lite-card ${row.risk ? 'has-risk' : ''} ${row.items.length ? '' : 'is-empty'} ${selected ? 'is-selected' : ''}" type="button" data-platform="${escapeHtml(row.key)}" data-executive-lite-platform="${escapeHtml(row.key)}" aria-pressed="${selected ? 'true' : 'false'}">
        <span class="executive-lite-card-top"><span>${escapeHtml(meta.title)}</span>${badge(status, tone)}</span>
        <strong>${escapeHtml(meta.label)}</strong>
        <span class="executive-lite-metrics">
          <span><b>${fmt(row.items.length)}</b> активных</span>
          <span><b>${fmt(row.waitingRop.length)}</b> у РОПа</span>
          <span><b>${fmt(row.waitingFinal.length)}</b> финал</span>
          <span><b>${fmt(row.noOwner.length)}</b> без owner</span>
        </span>
      </button>`;
  }

  function taskCard(task) {
    const overdue = isOverdue(task);
    const id = taskId(task);
    const priority = task?.priority === 'critical' ? 'Критично' : task?.priority === 'high' ? 'Высокий' : 'Средний';
    return `
      <button class="executive-lite-task ${overdue ? 'is-overdue' : ''} ${id && id === selectedTaskId ? 'is-selected' : ''}" type="button" data-platform="${escapeHtml(platformKey(task))}" data-executive-lite-task="${escapeHtml(id)}">
        <strong>${escapeHtml(taskTitle(task))}</strong>
        <span>${escapeHtml(taskOwner(task))} · ${escapeHtml(task?.due || 'без срока')}</span>
        <em>${escapeHtml(priority)} · ${escapeHtml(statusText(task))}</em>
      </button>`;
  }

  function taskRiskScore(task) {
    return (isOverdue(task) ? 80 : 0)
      + (task?.priority === 'critical' ? 45 : 0)
      + (task?.status === 'waiting_decision' ? 28 : 0)
      + (task?.status === 'waiting_rop' ? 18 : 0)
      + (!task?.owner ? 12 : 0);
  }

  function focusPlatformGroup(row, focusItems) {
    const meta = PLATFORM_META[row.key] || PLATFORM_META.cross;
    const items = focusItems
      .filter((task) => platformKey(task) === row.key)
      .sort((left, right) => taskRiskScore(right) - taskRiskScore(left) || String(left?.due || '9999-12-31').localeCompare(String(right?.due || '9999-12-31')));
    if (!items.length) return '';
    const shown = items.slice(0, 3);
    const hidden = Math.max(0, items.length - shown.length);
    const tone = row.overdue.length || row.critical.length ? 'danger'
      : row.waitingFinal.length || row.waitingRop.length || row.noOwner.length ? 'warn'
        : 'info';
    return `
      <section class="executive-lite-focus-group" data-platform="${escapeHtml(row.key)}">
        <div class="executive-lite-focus-group-head">
          <div>
            <span>${escapeHtml(meta.title)}</span>
            <strong>${escapeHtml(meta.label)}</strong>
          </div>
          <div class="badge-stack">
            ${badge(`${fmt(items.length)} задач`, tone)}
            ${row.overdue.length ? badge(`${fmt(row.overdue.length)} проср.`, 'danger') : ''}
            ${row.noOwner.length ? badge(`${fmt(row.noOwner.length)} без owner`, 'warn') : ''}
          </div>
        </div>
        <div class="executive-lite-task-list">${shown.map(taskCard).join('')}${hidden ? `<div class="executive-lite-more">Еще ${fmt(hidden)} в этом контуре</div>` : ''}</div>
        <button class="btn ghost small-btn" type="button" data-executive-lite-open="${escapeHtml(row.key)}">Показать здесь</button>
      </section>
    `;
  }

  function findTaskById(tasks, id) {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return null;
    return tasks.find((task) => taskId(task) === normalizedId) || null;
  }

  function taskSummaryText(task) {
    const bits = [
      task?.reason || '',
      task?.nextAction || '',
      task?.entityLabel || ''
    ].map((value) => String(value || '').trim()).filter(Boolean);
    return bits.length ? bits.join(' · ') : 'Коротко проверьте результат, подтвердите закрытие или верните задачу в работу с комментарием.';
  }

  function taskHistory(task) {
    const id = taskId(task);
    if (!id) return [];
    try {
      if (typeof window.getTaskHistory === 'function') return (window.getTaskHistory(id) || []).slice(0, 4);
      if (typeof getTaskHistory === 'function') return (getTaskHistory(id) || []).slice(0, 4);
    } catch {}
    const state = appState();
    return (state.storage?.comments || [])
      .map((comment) => {
        const match = String(comment?.text || '').match(/^\[\[task:([^\]]+)\]\]\s*\[\[kind:([^\]]+)\]\]\s*/i);
        return match && match[1] === id ? { ...comment, kind: match[2], text: String(comment.text || '').replace(match[0], '').trim() } : null;
      })
      .filter(Boolean)
      .sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1))
      .slice(0, 4);
  }

  function historyKindLabel(kind) {
    if (kind === 'status') return 'статус';
    if (kind === 'report') return 'отчет';
    if (kind === 'comment') return 'комментарий';
    if (kind === 'created') return 'создано';
    if (kind === 'updated') return 'обновлено';
    return kind || 'история';
  }

  function taskHistoryPanel(task) {
    const items = taskHistory(task);
    return `
      <div class="executive-lite-history">
        <div class="executive-lite-history-head">
          <span>История решений</span>
          <strong>${items.length ? `${fmt(items.length)} последних` : 'пока пусто'}</strong>
        </div>
        ${items.length ? `<div class="executive-lite-history-list">${items.map((item) => `
          <div class="executive-lite-history-item">
            <span>${escapeHtml(fmtDate(item.createdAt))} · ${escapeHtml(item.author || item.team || 'Команда')} · ${escapeHtml(historyKindLabel(item.kind))}</span>
            <p>${escapeHtml(item.text || '—')}</p>
          </div>
        `).join('')}</div>` : '<p class="executive-lite-history-empty">Здесь появятся согласования, возвраты и финальные закрытия по этой задаче.</p>'}
      </div>`;
  }

  function reviewQueueCard(task) {
    const id = taskId(task);
    const selected = id && id === selectedTaskId;
    const meta = PLATFORM_META[platformKey(task)] || PLATFORM_META.cross;
    return `
      <button class="executive-lite-review-item ${selected ? 'is-selected' : ''}" type="button" data-platform="${escapeHtml(platformKey(task))}" data-executive-lite-task="${escapeHtml(id)}">
        <span class="executive-lite-review-item-top">
          <strong>${escapeHtml(taskTitle(task))}</strong>
          ${badge(statusText(task), taskQueueTone(task))}
        </span>
        <span>${escapeHtml(taskOwner(task))} · ${escapeHtml(meta.label)} · ${escapeHtml(task?.due || 'без срока')}</span>
      </button>`;
  }

  function taskDecisionPanel(task, queueLength) {
    if (!task) {
      return `
        <div class="executive-lite-decision is-empty">
          <span>Приемка</span>
          <strong>Нет задач на подтверждение</strong>
          <p>Когда сотрудник сдаст задачу РОПу или руководителю, она появится здесь. Переходить в общий задачник для финального закрытия не нужно.</p>
        </div>`;
    }

    const status = String(task?.status || 'new');
    const isRop = status === 'waiting_rop';
    const isFinal = status === 'waiting_decision';
    const actionHint = isRop
      ? 'Если результат нормальный, переведите задачу на финальное закрытие. Если не хватает деталей, верните в работу.'
      : isFinal
        ? 'Финальное закрытие уберет задачу из активной очереди и сохранит историю в общем контуре.'
        : 'Эта задача еще не сдана на приемку. Можно открыть карточку или вернуть в работу при необходимости.';
    const primary = isRop
      ? `<button class="btn primary" type="button" data-executive-lite-action="approve" data-task-id="${escapeHtml(taskId(task))}">Подтвердить РОП</button>`
      : isFinal
        ? `<button class="btn primary" type="button" data-executive-lite-action="final" data-task-id="${escapeHtml(taskId(task))}">Финально закрыть</button>`
        : '';

    return `
      <div class="executive-lite-decision" data-platform="${escapeHtml(platformKey(task))}">
        <div class="executive-lite-decision-head">
          <div>
            <span>Проверка задачи</span>
            <strong>${escapeHtml(taskTitle(task))}</strong>
          </div>
          <div class="badge-stack">${badge(statusText(task), taskQueueTone(task))}${badge(taskPriorityText(task), taskQueueTone(task))}</div>
        </div>
        <p class="executive-lite-decision-meta">${escapeHtml(taskMetaLine(task))}</p>
        <div class="executive-lite-decision-body">
          <span>Что проверяем</span>
          <p>${escapeHtml(taskSummaryText(task))}</p>
        </div>
        ${taskHistoryPanel(task)}
        <div class="executive-lite-decision-note">
          <label for="executive-lite-comment">Комментарий для истории</label>
          <textarea id="executive-lite-comment" data-executive-lite-comment rows="3" placeholder="Например: результат проверен, можно закрывать / вернуть: не хватает расчета по марже."></textarea>
          <small>${escapeHtml(actionHint)}</small>
          <div class="executive-lite-return-templates">
            ${RETURN_TEMPLATES.map(([key, label, text]) => `<button class="btn ghost small-btn" type="button" data-executive-lite-return-template="${escapeHtml(key)}" data-template-text="${escapeHtml(text)}" data-task-id="${escapeHtml(taskId(task))}">${escapeHtml(label)}</button>`).join('')}
          </div>
        </div>
        <div class="executive-lite-actions">
          ${primary}
          <button class="btn ghost" type="button" data-executive-lite-action="return" data-task-id="${escapeHtml(taskId(task))}">Вернуть в работу</button>
          <button class="btn ghost" type="button" data-executive-lite-modal="${escapeHtml(taskId(task))}">Полная карточка</button>
          <span>${fmt(queueLength)} в очереди</span>
        </div>
      </div>`;
  }

  function reviewWorkbench(tasks, rows) {
    const filtered = selectedPlatform === 'all'
      ? tasks
      : tasks.filter((task) => platformKey(task) === selectedPlatform);
    if (!['review', 'new', 'overdue', 'all'].includes(selectedQueueFilter)) selectedQueueFilter = 'review';
    const counts = queueCounts(filtered);
    const queue = queueItems(filtered, selectedQueueFilter);
    const selectedAny = findTaskById(filtered, selectedTaskId);
    let items = queue.slice(0, 16);
    if (selectedAny && !findTaskById(items, selectedTaskId)) items = [selectedAny].concat(items).slice(0, 9);
    if (!findTaskById(items, selectedTaskId)) selectedTaskId = taskId(items[0]) || '';
    const selected = findTaskById(items, selectedTaskId);
    const meta = selectedPlatform === 'all'
      ? { label: 'Все площадки', title: 'Все контуры' }
      : (PLATFORM_META[selectedPlatform] || PLATFORM_META.cross);
    const row = rows.find((item) => item.key === selectedPlatform);
    const waiting = row ? row.waitingRop.length + row.waitingFinal.length : reviewTasks(tasks).length;

    return `
      <div class="executive-lite-workbench" data-executive-lite-workbench data-platform="${escapeHtml(selectedPlatform)}">
        <div class="executive-lite-head">
          <div>
            <span>Рабочее окно РОПа</span>
            <strong>${escapeHtml(meta.label)}: приемка без перехода в задачник</strong>
          </div>
          <div class="executive-lite-workbench-toolbar">
            <div class="badge-stack">${badge(`${fmt(waiting)} на подтверждение`, waiting ? 'warn' : 'ok')}${actionMessage ? badge(actionMessage, 'ok') : ''}${composerMessage ? badge(composerMessage, 'info') : ''}</div>
            <button class="btn primary small-btn" type="button" data-executive-lite-compose>Поставить общую задачу</button>
          </div>
        </div>
        ${composerOpen ? generalTaskComposer() : ''}
        ${queueFilterBar(counts)}
        <div class="executive-lite-review-grid">
          <section class="executive-lite-review-queue">
            <div class="executive-lite-review-queue-head">
              <strong>Сдали на проверку</strong>
              <span>${queue.length ? 'Сначала РОП и финальное закрытие' : 'Пока нет сданных, показываю ближайшие риски'}</span>
            </div>
            <div class="executive-lite-review-list">${items.length ? items.map(reviewQueueCard).join('') : '<div class="empty">Очередь чистая</div>'}</div>
          </section>
          ${taskDecisionPanel(selected, items.length)}
        </div>
      </div>`;
  }

  function generalTaskComposer() {
    const platformOptions = [
      ['cross', 'Общее'],
      ['wb', 'WB'],
      ['ozon', 'Ozon'],
      ['ya', 'Я.Маркет'],
      ['product', 'Продукт'],
      ['goldapple', 'ЗЯ'],
      ['letu', "Л'Этуаль"],
      ['magnit', 'Магнит']
    ];
    const selected = selectedPlatform === 'all' ? 'cross' : selectedPlatform;
    return `
      <form class="executive-lite-composer" data-executive-lite-composer>
        <div class="executive-lite-composer-main">
          <label>Что нужно сделать<input name="title" required placeholder="Например: согласовать акцию WB / проверить остатки / подготовить ответ"></label>
          <label>Первый шаг<textarea name="nextAction" rows="2" placeholder="Коротко: что должен сделать исполнитель и какой результат нужен"></textarea></label>
        </div>
        <div class="executive-lite-composer-side">
          <label>Контур<select name="platform">${platformOptions.map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>
          <label>Кто ведет<input name="owner" placeholder="Имя ответственного"></label>
          <label>Срок<input name="due" type="date" value="${escapeHtml(dueDefault())}"></label>
          <label>Приоритет<select name="priority"><option value="medium">Средний</option><option value="high">Высокий</option><option value="critical">Критично</option><option value="low">Низкий</option></select></label>
        </div>
        <div class="executive-lite-composer-actions">
          <button class="btn primary" type="submit">Поставить задачу</button>
          <button class="btn ghost" type="button" data-executive-lite-compose-close>Свернуть</button>
        </div>
      </form>`;
  }

  function fallbackCreateTask(payload) {
    const state = appState();
    state.storage = state.storage || {};
    state.storage.tasks = Array.isArray(state.storage.tasks) ? state.storage.tasks : [];
    const now = new Date().toISOString();
    const task = {
      id: `task-executive-${Date.now()}`,
      source: 'manual',
      articleKey: '',
      entityLabel: 'Общая задача',
      title: payload.title,
      type: 'general',
      priority: payload.priority || 'medium',
      platform: payload.platform || 'cross',
      owner: payload.owner || '',
      due: payload.due || dueDefault(),
      status: 'new',
      nextAction: payload.nextAction || '',
      reason: 'Поставлено из вкладки руководителя',
      createdAt: now
    };
    state.storage.tasks.unshift(task);
    if (typeof window.saveLocalStorage === 'function') window.saveLocalStorage();
    else if (typeof saveLocalStorage === 'function') saveLocalStorage();
    return task;
  }

  async function createExecutiveGeneralTask(form) {
    const data = new FormData(form);
    const title = String(data.get('title') || '').trim();
    if (!title) {
      composerMessage = 'Нужно название';
      renderNow(true);
      focusWorkbench();
      return;
    }
    const payload = {
      title,
      platform: String(data.get('platform') || 'cross'),
      owner: String(data.get('owner') || '').trim(),
      due: String(data.get('due') || '').trim() || dueDefault(),
      priority: String(data.get('priority') || 'medium'),
      nextAction: String(data.get('nextAction') || '').trim(),
      type: 'general',
      entityLabel: 'Общая задача',
      skipRerender: true
    };
    const task = typeof window.createManualTask === 'function'
      ? await window.createManualTask(payload)
      : fallbackCreateTask(payload);
    selectedPlatform = payload.platform || 'cross';
    selectedTaskId = task?.id || '';
    composerOpen = false;
    composerMessage = 'Задача поставлена';
    actionMessage = '';
    window.dispatchEvent(new CustomEvent('altea:portal-storage-updated', { detail: { source: 'executive-lite', taskId: selectedTaskId, action: 'create' } }));
    renderNow(true);
    focusWorkbench();
  }

  async function runExecutiveAction(taskIdValue, action, comment) {
    const id = String(taskIdValue || '').trim();
    if (!id) return;
    const note = String(comment || '').trim();
    try {
      if (action === 'final' && !note) {
        actionMessage = 'Нужен короткий итог';
        renderNow(true);
        return;
      }

      let updated = null;
      if (action === 'approve') {
        const approve = typeof window.approveTaskByRop === 'function' ? window.approveTaskByRop : null;
        updated = approve ? await approve(id, note || 'Согласовано из вкладки руководителя.') : null;
      } else if (action === 'return') {
        const back = typeof window.returnTaskToWork === 'function' ? window.returnTaskToWork : null;
        updated = back ? await back(id, note || 'Возвращено в работу из вкладки руководителя.') : null;
      } else if (action === 'final') {
        const close = typeof window.finalCloseTaskWithReport === 'function'
          ? window.finalCloseTaskWithReport
          : (typeof window.closeTaskWithReport === 'function' ? window.closeTaskWithReport : null);
        updated = close ? await close(id, note) : null;
      }

      if (!updated && typeof window.updateTaskRecord === 'function') {
        const status = action === 'approve' ? 'waiting_decision' : action === 'return' ? 'in_progress' : 'done';
        updated = await window.updateTaskRecord(id, { status });
      }

      if (!updated) throw new Error('Не удалось обновить задачу.');
      actionMessage = action === 'approve'
        ? 'Передано на финал'
        : action === 'return'
          ? 'Вернули в работу'
          : 'Закрыто';
      selectedTaskId = action === 'final' ? '' : (updated.id || id);
      window.dispatchEvent(new CustomEvent('altea:portal-storage-updated', { detail: { source: 'executive-lite', taskId: id, action } }));
      renderNow(true);
    } catch (error) {
      console.error(error);
      actionMessage = error?.message || 'Ошибка обновления';
      renderNow(true);
    }
  }

  function bind(root) {
    root.querySelectorAll('[data-executive-lite-open],[data-executive-lite-platform]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.getAttribute('data-executive-lite-platform') || button.getAttribute('data-executive-lite-open') || 'all';
        selectedPlatform = PLATFORM_META[key] ? key : 'all';
        selectedTaskId = '';
        actionMessage = '';
        renderNow(true);
        focusWorkbench();
      });
    });

    root.querySelectorAll('[data-executive-lite-task]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-executive-lite-task');
        if (!id) return;
        const task = findTaskById(activeTasks(), id);
        if (task) selectedPlatform = platformKey(task);
        selectedTaskId = id;
        actionMessage = '';
        renderNow(true);
        focusWorkbench();
      });
    });

    root.querySelector('[data-executive-lite-compose]')?.addEventListener('click', () => {
      composerOpen = true;
      composerMessage = '';
      actionMessage = '';
      renderNow(true);
      focusWorkbench();
    });

    root.querySelector('[data-executive-lite-composer]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      await createExecutiveGeneralTask(event.currentTarget);
    });

    root.querySelector('[data-executive-lite-compose-close]')?.addEventListener('click', () => {
      composerOpen = false;
      composerMessage = '';
      renderNow(true);
      focusWorkbench();
    });

    root.querySelectorAll('[data-executive-lite-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const panel = button.closest('[data-executive-lite-workbench]') || root;
        const comment = panel.querySelector('[data-executive-lite-comment]')?.value || '';
        await runExecutiveAction(button.getAttribute('data-task-id'), button.getAttribute('data-executive-lite-action'), comment);
      });
    });

    root.querySelectorAll('[data-executive-lite-modal]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-executive-lite-modal');
        if (id && typeof window.renderTaskModal === 'function') window.renderTaskModal(id);
      });
    });

    root.querySelector('[data-executive-lite-create]')?.addEventListener('click', () => {
      const state = appState();
      state.controlFilters = state.controlFilters || {};
      state.controlFilters.platform = state.controlFilters.platform || 'all';
      state.controlFilters.status = 'active';
      state.controlFilters.horizon = 'all';
      state.controlFilters.source = 'all';
      state.controlFilters.taskSimpleCreateOpen = true;
      if (typeof window.setView === 'function') window.setView('control');
      else window.location.hash = '#control';
    });
  }

  function injectStyles() {
    if (document.getElementById('executive-lite-guard-style')) return;
    const style = document.createElement('style');
    style.id = 'executive-lite-guard-style';
    style.textContent = `
      #view-executive[data-executive-layer]{display:flex;flex-direction:column;gap:14px}
      #view-executive[data-executive-layer] [data-portal-view-guide],
      #view-executive[data-executive-layer] .portal-view-guide,
      #view-executive[data-executive-layer] .executive-guide{display:none!important}
      #view-executive[data-executive-layer] .section-title.executive-lite-title{margin-bottom:0}
      .executive-lite-copy{margin-top:8px;color:var(--muted);line-height:1.45;max-width:960px}
      .executive-lite-surface,.executive-lite-focus,.executive-lite-workbench{border:1px solid rgba(212,164,74,.2);border-radius:12px;background:rgba(255,255,255,.025);padding:14px}
      .executive-lite-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
      .executive-lite-head span{display:block;font-size:11px;font-weight:800;text-transform:uppercase;color:var(--muted)}
      .executive-lite-head strong{display:block;margin-top:3px;color:#fff7e6;font-size:18px;line-height:1.15}
      .executive-lite-workbench-toolbar{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
      .executive-lite-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .executive-lite-card{position:relative;display:flex;flex-direction:column;gap:9px;min-height:126px;overflow:hidden;text-align:left;border:1px solid var(--platform-border,rgba(255,255,255,.08));border-radius:10px;background:linear-gradient(135deg,var(--platform-soft,rgba(255,255,255,.025)),rgba(0,0,0,.22));color:inherit;padding:12px 12px 12px 14px;cursor:pointer}
      .executive-lite-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--platform-color,#d4a44a);opacity:.92}
      .executive-lite-card:hover{border-color:var(--platform-strong,rgba(212,164,74,.46));background:linear-gradient(135deg,var(--platform-active,rgba(212,164,74,.11)),rgba(0,0,0,.22))}
      .executive-lite-card.has-risk{border-color:var(--platform-strong,rgba(212,164,74,.34));background:linear-gradient(135deg,var(--platform-active,rgba(212,164,74,.09)),rgba(0,0,0,.2))}
      .executive-lite-card.is-selected{border-color:var(--platform-strong,rgba(212,164,74,.72));box-shadow:0 0 0 1px var(--platform-border,rgba(212,164,74,.28)),0 18px 44px rgba(0,0,0,.26)}
      .executive-lite-card.is-empty{opacity:.68}
      .executive-lite-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;font-size:11px;color:var(--muted)}
      .executive-lite-card>strong{font-size:18px;line-height:1.1;color:#fff7e6}
      .executive-lite-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:auto}
      .executive-lite-metrics span{border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(0,0,0,.18);padding:7px;font-size:11px;color:var(--muted)}
      .executive-lite-metrics b{display:block;color:#fff7e6;font-size:15px;line-height:1}
      .executive-lite-task-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .executive-lite-focus-board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .executive-lite-focus-group{display:flex;flex-direction:column;gap:10px;border:1px solid var(--platform-border,rgba(255,255,255,.08));border-radius:10px;background:linear-gradient(180deg,var(--platform-soft,rgba(255,255,255,.025)),rgba(0,0,0,.18));padding:12px}
      .executive-lite-focus-group-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
      .executive-lite-focus-group-head span{display:block;font-size:11px;color:var(--muted);line-height:1.25}
      .executive-lite-focus-group-head strong{display:block;margin-top:2px;color:#fff7e6;font-size:18px;line-height:1.1}
      .executive-lite-task-list{display:flex;flex-direction:column;gap:8px}
      .executive-lite-more{border:1px dashed rgba(255,255,255,.12);border-radius:8px;padding:8px;color:var(--muted);font-size:12px}
      .executive-lite-clean{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;color:var(--muted);font-size:12px}
      .executive-lite-clean span{border:1px solid rgba(255,255,255,.07);border-radius:999px;padding:5px 8px;background:rgba(0,0,0,.16)}
      .executive-lite-task{position:relative;text-align:left;border:1px solid rgba(255,255,255,.08);border-left-color:var(--platform-strong,rgba(255,255,255,.14));border-radius:10px;background:rgba(0,0,0,.18);padding:10px 12px 10px 14px;color:inherit;cursor:pointer}
      .executive-lite-task::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--platform-color,#d4a44a);opacity:.82}
      .executive-lite-task.is-overdue{border-color:rgba(217,83,79,.42);background:rgba(217,83,79,.08)}
      .executive-lite-task.is-selected{border-color:var(--platform-strong,rgba(212,164,74,.56));background:linear-gradient(135deg,var(--platform-active,rgba(212,164,74,.12)),rgba(0,0,0,.2))}
      .executive-lite-task strong{display:block;color:#fff7e6;line-height:1.25}
      .executive-lite-task span{display:block;margin-top:6px;font-size:12px;color:var(--muted)}
      .executive-lite-task em{display:inline-block;margin-top:9px;font-style:normal;font-size:11px;border:1px solid rgba(212,164,74,.25);border-radius:999px;padding:4px 8px;color:#f3dfad}
      .executive-lite-task small{display:inline-block;margin-left:6px;margin-top:9px;color:#fff7e6;font-size:11px;opacity:.78}
      .executive-lite-review-grid{display:grid;grid-template-columns:minmax(300px,.86fr) minmax(420px,1.14fr);gap:12px}
      .executive-lite-review-queue,.executive-lite-decision{border:1px solid var(--platform-border,rgba(255,255,255,.08));border-radius:10px;background:linear-gradient(180deg,var(--platform-soft,rgba(255,255,255,.025)),rgba(0,0,0,.2));padding:12px}
      .executive-lite-review-queue-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
      .executive-lite-review-queue-head strong,.executive-lite-decision-head strong{display:block;color:#fff7e6;line-height:1.2}
      .executive-lite-review-queue-head span,.executive-lite-decision-head span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;font-weight:800}
      .executive-lite-review-list{display:flex;flex-direction:column;gap:8px;max-height:440px;overflow:auto;padding-right:2px}
      .executive-lite-review-item{display:flex;flex-direction:column;gap:6px;text-align:left;border:1px solid rgba(255,255,255,.08);border-left:3px solid var(--platform-color,#d4a44a);border-radius:9px;background:rgba(0,0,0,.2);color:inherit;padding:10px 11px;cursor:pointer}
      .executive-lite-review-item:hover,.executive-lite-review-item.is-selected{border-color:var(--platform-strong,rgba(212,164,74,.54));background:linear-gradient(135deg,var(--platform-active,rgba(212,164,74,.11)),rgba(0,0,0,.2))}
      .executive-lite-review-item-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
      .executive-lite-review-item-top strong{color:#fff7e6;line-height:1.25}
      .executive-lite-review-item>span:last-child{color:var(--muted);font-size:12px;line-height:1.35}
      .executive-lite-decision{min-height:260px;display:flex;flex-direction:column;gap:12px}
      .executive-lite-decision.is-empty{justify-content:center}
      .executive-lite-decision-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      .executive-lite-decision-meta{margin:0;color:var(--muted);line-height:1.45}
      .executive-lite-decision-body{border:1px solid rgba(255,255,255,.07);border-radius:9px;background:rgba(0,0,0,.18);padding:10px}
      .executive-lite-decision-body span,.executive-lite-decision-note label{display:block;margin-bottom:6px;color:#f3dfad;font-size:11px;font-weight:800;text-transform:uppercase}
      .executive-lite-decision-body p{margin:0;color:#fff7e6;line-height:1.45}
      .executive-lite-decision-note textarea{width:100%;min-height:86px;resize:vertical;border:1px solid rgba(212,164,74,.2);border-radius:8px;background:rgba(0,0,0,.24);color:#fff7e6;padding:10px;font:inherit}
      .executive-lite-decision-note textarea:focus{outline:none;border-color:var(--platform-strong,rgba(212,164,74,.55));box-shadow:0 0 0 2px var(--platform-soft,rgba(212,164,74,.12))}
      .executive-lite-decision-note small{display:block;margin-top:6px;color:var(--muted);line-height:1.35}
      .executive-lite-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:auto}
      .executive-lite-actions>span{margin-left:auto;color:var(--muted);font-size:12px}
      .executive-lite-composer{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr);gap:12px;margin-bottom:12px;border:1px solid var(--platform-border,rgba(212,164,74,.22));border-radius:10px;background:linear-gradient(135deg,var(--platform-soft,rgba(212,164,74,.06)),rgba(0,0,0,.2));padding:12px}
      .executive-lite-composer-main,.executive-lite-composer-side{display:grid;gap:10px}
      .executive-lite-composer-side{grid-template-columns:repeat(2,minmax(0,1fr))}
      .executive-lite-composer label{display:grid;gap:6px;color:#f3dfad;font-size:11px;font-weight:800;text-transform:uppercase}
      .executive-lite-composer input,.executive-lite-composer select,.executive-lite-composer textarea{width:100%;border:1px solid rgba(212,164,74,.2);border-radius:8px;background:rgba(0,0,0,.24);color:#fff7e6;padding:9px 10px;font:inherit;text-transform:none;font-weight:500}
      .executive-lite-composer textarea{resize:vertical}
      .executive-lite-composer input:focus,.executive-lite-composer select:focus,.executive-lite-composer textarea:focus{outline:none;border-color:var(--platform-strong,rgba(212,164,74,.55));box-shadow:0 0 0 2px var(--platform-soft,rgba(212,164,74,.12))}
      .executive-lite-composer-actions{grid-column:1/-1;display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
      [data-platform="all"]{--platform-color:#d4a44a;--platform-soft:rgba(212,164,74,.065);--platform-active:rgba(212,164,74,.13);--platform-border:rgba(212,164,74,.22);--platform-strong:rgba(212,164,74,.54)}
      [data-platform="wb"]{--platform-color:#8b5cf6;--platform-soft:rgba(139,92,246,.075);--platform-active:rgba(139,92,246,.16);--platform-border:rgba(139,92,246,.25);--platform-strong:rgba(139,92,246,.58)}
      [data-platform="ozon"]{--platform-color:#1683ff;--platform-soft:rgba(22,131,255,.075);--platform-active:rgba(22,131,255,.16);--platform-border:rgba(22,131,255,.25);--platform-strong:rgba(22,131,255,.58)}
      [data-platform="ya"]{--platform-color:#f4c430;--platform-soft:rgba(244,196,48,.075);--platform-active:rgba(244,196,48,.14);--platform-border:rgba(244,196,48,.24);--platform-strong:rgba(244,196,48,.54)}
      [data-platform="goldapple"]{--platform-color:#9ac43a;--platform-soft:rgba(154,196,58,.075);--platform-active:rgba(154,196,58,.15);--platform-border:rgba(154,196,58,.24);--platform-strong:rgba(154,196,58,.54)}
      [data-platform="letu"]{--platform-color:#d946ef;--platform-soft:rgba(217,70,239,.07);--platform-active:rgba(217,70,239,.15);--platform-border:rgba(217,70,239,.23);--platform-strong:rgba(217,70,239,.52)}
      [data-platform="magnit"]{--platform-color:#ef4444;--platform-soft:rgba(239,68,68,.07);--platform-active:rgba(239,68,68,.15);--platform-border:rgba(239,68,68,.23);--platform-strong:rgba(239,68,68,.52)}
      [data-platform="product"]{--platform-color:#22c55e;--platform-soft:rgba(34,197,94,.07);--platform-active:rgba(34,197,94,.15);--platform-border:rgba(34,197,94,.23);--platform-strong:rgba(34,197,94,.52)}
      [data-platform="cross"]{--platform-color:#94a3b8;--platform-soft:rgba(148,163,184,.065);--platform-active:rgba(148,163,184,.13);--platform-border:rgba(148,163,184,.22);--platform-strong:rgba(148,163,184,.48)}
      @media (max-width:1280px){.executive-lite-grid,.executive-lite-task-grid,.executive-lite-focus-board{grid-template-columns:repeat(2,minmax(0,1fr))}.executive-lite-review-grid{grid-template-columns:1fr}}
      @media (max-width:820px){.executive-lite-grid,.executive-lite-task-grid,.executive-lite-focus-board,.executive-lite-review-grid,.executive-lite-composer,.executive-lite-composer-side{grid-template-columns:1fr}.executive-lite-head,.executive-lite-decision-head,.executive-lite-review-queue-head{flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function renderNow(force) {
    const root = document.getElementById('view-executive');
    if (!root) return;

    const tasks = activeTasks();
    const signature = dataSignature(tasks);
    const stale = force
      || root.dataset.executiveLayer !== VERSION
      || root.dataset.executiveSignature !== signature
      || !root.querySelector('[data-executive-lite-panel]');

    if (!stale) return;

    if (selectedPlatform !== 'all' && !PLATFORM_META[selectedPlatform]) selectedPlatform = 'all';
    const rows = PLATFORM_KEYS.map((key) => rowFor(key, tasks));
    const allRow = rowFor('all', tasks);
    const visibleRows = rows.filter((row) => row.items.length || row.risk);
    const cleanRows = rows.filter((row) => !row.items.length && !row.risk);
    const gridRows = [allRow].concat(visibleRows.length ? visibleRows : rows.slice(0, 1));
    const focus = focusTasks(tasks).slice(0, 12);
    const waitingFinal = tasks.filter((task) => task?.status === 'waiting_decision');
    const waitingRop = tasks.filter((task) => task?.status === 'waiting_rop');
    const overdue = tasks.filter(isOverdue);
    const noOwner = tasks.filter((task) => !task?.owner);

    rendering = true;
    try {
      root.dataset.executiveLayer = VERSION;
      root.dataset.executiveSignature = signature;
      root.innerHTML = `
        <div class="section-title executive-lite-title">
          <div>
            <h2>Руководителю</h2>
            <div class="executive-lite-copy">Сначала видно, где горит. Клик по площадке открывает её задачи без общей каши.</div>
          </div>
          <div class="badge-stack">${badge(`${fmt(waitingFinal.length)} финал`, waitingFinal.length ? 'warn' : 'ok')}${badge(`${fmt(waitingRop.length)} у РОПа`, waitingRop.length ? 'info' : 'ok')}</div>
        </div>
        <div class="executive-lite-surface" data-executive-lite-panel>
          <div class="executive-lite-head">
            <div>
              <span>Площадки</span>
              <strong>Куда смотреть сейчас</strong>
            </div>
            <div class="badge-stack">${badge(`${fmt(tasks.length)} активных`, tasks.length ? 'info' : 'ok')}${badge(`${fmt(overdue.length)} проср.`, overdue.length ? 'danger' : 'ok')}${badge(`${fmt(noOwner.length)} без owner`, noOwner.length ? 'warn' : 'ok')}</div>
          </div>
          <div class="executive-lite-grid">${gridRows.map(platformCard).join('')}</div>
          ${cleanRows.length ? `<div class="executive-lite-clean"><span>Без активных задач:</span>${cleanRows.map((row) => `<span>${escapeHtml((PLATFORM_META[row.key] || PLATFORM_META.cross).label)}</span>`).join('')}</div>` : ''}
        </div>
        ${reviewWorkbench(tasks, rows)}
        <div class="executive-lite-focus">
          <div class="executive-lite-head">
            <div>
              <span>Фокус</span>
              <strong>Что требует решения сегодня по площадкам</strong>
            </div>
            ${badge(`${fmt(focus.length)} задач`, focus.length ? 'danger' : 'ok')}
          </div>
          <div class="executive-lite-focus-board">${visibleRows.map((row) => focusPlatformGroup(row, focus)).join('') || '<div class="empty">Срочных решений нет</div>'}</div>
        </div>`;
      bind(root);
      watch();
    } finally {
      rendering = false;
    }
  }

  function isExecutiveActive() {
    const state = appState();
    return window.location.hash === '#executive' || state.activeView === 'executive';
  }

  function schedule(force) {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      if (!isExecutiveActive()) return;
      injectStyles();
      renderNow(Boolean(force));
    });
  }

  function watch() {
    const root = document.getElementById('view-executive');
    if (!root || typeof MutationObserver !== 'function' || observer) return;
    observer = new MutationObserver(() => {
      if (!rendering) schedule(false);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }

  function installRenderLock() {
    renderApi = function executiveLiteRender() {
      injectStyles();
      renderNow(false);
    };
    renderApi.__alteaExecutiveLite = true;

    try {
      const descriptor = Object.getOwnPropertyDescriptor(window, 'renderExecutive');
      if (!descriptor || descriptor.configurable) {
        Object.defineProperty(window, 'renderExecutive', {
          configurable: true,
          get() {
            return renderApi;
          },
          set(next) {
            if (next && next.__alteaExecutiveLite) renderApi = next;
          }
        });
      } else {
        window.renderExecutive = renderApi;
      }
    } catch {
      window.renderExecutive = renderApi;
    }

    try { renderExecutive = renderApi; } catch {}
  }

  function restoreRenderApi() {
    if (!renderApi) return;
    try {
      if (window.renderExecutive !== renderApi) window.renderExecutive = renderApi;
    } catch {}
    try {
      if (renderExecutive !== renderApi) renderExecutive = renderApi;
    } catch {}
  }

  window.__ALTEA_EXECUTIVE_LITE_GUARD_READY__ = VERSION;
  installRenderLock();
  restoreRenderApi();

  window.addEventListener('hashchange', () => { restoreRenderApi(); schedule(false); });
  window.addEventListener('altea:viewchange', () => { restoreRenderApi(); schedule(false); });
  window.addEventListener('altea:portal-storage-updated', () => { restoreRenderApi(); schedule(false); });
  window.addEventListener('load', () => { restoreRenderApi(); schedule(false); }, { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(false), { once: true });

  schedule(false);
  [60, 180, 420, 900, 1800, 3600, 7000].forEach((delay) => window.setTimeout(restoreRenderApi, delay));
  window.setTimeout(() => schedule(false), 120);
  window.setTimeout(() => schedule(false), 700);
})();
