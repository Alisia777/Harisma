(function () {
  if (window.__ALTEA_FORM_VISUAL_REFINE_20260422__) return;
  window.__ALTEA_FORM_VISUAL_REFINE_20260422__ = true;

  const WS = {
    all: { label: 'Все контуры', chip: 'Все контуры', kind: '' },
    wb: { label: 'РОП WB', chip: 'WB', kind: 'warn' },
    ozon: { label: 'РОП Ozon', chip: 'Ozon', kind: 'info' },
    ya: { label: 'Я.Маркет', chip: 'Я.Маркет', kind: 'ok' },
    goldapple: { label: 'Золотое яблоко', chip: 'Золотое яблоко', kind: 'ok' },
    letu: { label: "Л'Этуаль", chip: "Л'Этуаль", kind: 'ok' },
    magnit: { label: 'Магнит Маркет', chip: 'Магнит Маркет', kind: 'ok' },
    product: { label: 'Новинки', chip: 'Новинки', kind: 'info' },
    executive: { label: 'Управленческий финал', chip: 'Финал', kind: 'danger' },
    cross: { label: 'Общий контур', chip: 'Общий контур', kind: '' }
  };
  const ST = {
    new: 'Новая',
    in_progress: 'В работе',
    waiting_team: 'Ждёт другой отдел',
    waiting_rop: 'На согласовании у РОПа',
    waiting_decision: 'На согласовании у руководителя',
    done: 'Сделано',
    cancelled: 'Отменено'
  };
  const EXEC_PLATFORM_KEYS = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'cross', 'product'];
  const EXEC_QUEUE_LIMIT = 6;
  const baseTaskModal = typeof window.renderTaskModal === 'function' ? window.renderTaskModal : null;
  const baseControl = typeof window.renderControlCenter === 'function' ? window.renderControlCenter : null;
  const baseExecutive = typeof window.renderExecutive === 'function' ? window.renderExecutive : null;
  const stepSubmitInFlight = new Set();
  const stepApproveInFlight = new Set();
  const stepReturnInFlight = new Set();
  const finalCloseInFlight = new Set();

  const meta = (k) => WS[k] || WS.cross;
  const task = (id) => typeof getTask === 'function' ? getTask(id) : null;
  const history = (id) => typeof getTaskHistory === 'function' ? getTaskHistory(id) : [];
  const owners = () => typeof ownerOptions === 'function' ? ownerOptions() : [];
  const isGoldAppleSignal = (raw = '', compact = '') => {
    const text = String(raw || '').toLowerCase();
    const flat = String(compact || text.replace(/[\s._'`"\u2019-]+/g, '')).toLowerCase();
    if (['goldapple', 'goldenapple', 'zya', '\u0437\u044f', '\u0437\u043e\u043b\u043e\u0442\u043e\u0435\u044f\u0431\u043b\u043e\u043a\u043e'].includes(flat)) return true;
    if (/(^|[^a-z0-9\u0430-\u044f\u0451])(?:z\s*y\s*a|\u0437\s*\u044f)(?=$|[^a-z0-9\u0430-\u044f\u0451])/i.test(text)) return true;
    return /\u0437\u043e\u043b\u043e\u0442[\u0430-\u044f\u0451\s-]*(\u044f\u0431\u043b\u043e\u043a|\u044f\u0431\u043b)|golden\s*apple|gold[\s_-]*apple|goldapple/i.test(text);
  };
  const inferMarketplaceKey = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    const compact = raw.replace(/[\s._'`"\u2019-]+/g, '');
    if (!raw) return '';
    if (isGoldAppleSignal(raw, compact)) return 'goldapple';
    if (/\u043b[\s'`\u2019.-]*[\u0435\u044d]\u0442\u0443\u0430\u043b|\u043b\u0435\u0442\u0443\u0430\u043b\u044c?|\u043b\u044d\u0442\u0443\u0430\u043b\u044c?|letual|letu|letoile|l[\s'`.-]*etoile/.test(raw) || ['letu', 'letual', 'letoile', '\u043b\u0435\u0442\u0443\u0430\u043b\u044c', '\u043b\u0435\u0442\u0443\u0430\u043b', '\u043b\u044d\u0442\u0443\u0430\u043b\u044c', '\u043b\u044d\u0442\u0443\u0430\u043b'].includes(compact)) return 'letu';
    if (/\u043c\u0430\u0433\u043d\u0438\u0442|magnit|magnet|(^|\W)mm($|\W)/.test(raw) || ['magnit', 'magnitmarket', 'magnet', 'magnetmarket', 'mm', '\u043c\u0430\u0433\u043d\u0438\u0442', '\u043c\u0430\u0433\u043d\u0438\u0442\u043c\u0430\u0440\u043a\u0435\u0442'].includes(compact)) return 'magnit';
    if (/\u044f\u043d\u0434\u0435\u043a\u0441|\u044f[.\s-]?\u043c\u0430\u0440\u043a\u0435\u0442|yandex|(^|[^a-z0-9])(ya|ym)([^a-z0-9]|$)|(^|[^\u0430-\u044f\u04510-9])\u044f\u043c([^\u0430-\u044f\u04510-9]|$)/.test(raw)) return 'ya';
    if (isGoldAppleSignal(raw, compact)) return 'goldapple';
    if (/\u043b['\u2019]?\s?[\u0435\u044d]\u0442\u0443\u0430\u043b|\u043b\u0435\u0442\u0443\u0430\u043b\u044c|letual|letu|letoile|l['\s.-]*etoile/.test(raw) || ['letu', 'letual', 'letoile'].includes(compact)) return 'letu';
    if (/\u043c\u0430\u0433\u043d\u0438\u0442|magnit|(^|\W)mm($|\W)/.test(raw) || ['magnit', 'magnitmarket', 'mm'].includes(compact)) return 'magnit';
    if (/\u044f\u043d\u0434\u0435\u043a\u0441|\u044f[.\s-]?\u043c\u0430\u0440\u043a\u0435\u0442|\u044f\u043c|ym|yandex/.test(raw)) return 'ya';
    return '';
  };
  const normPlatform = (v) => {
    const raw = String(v || '').trim().toLowerCase();
    const compact = raw.replace(/[\s._'`"\u2019-]+/g, '');
    if (raw === 'retail') return 'cross';
    if (['goldapple', 'goldenapple', 'zya', 'ga'].includes(compact)) return 'goldapple';
    if (['letu', 'letual', 'letoile'].includes(compact)) return 'letu';
    if (['magnit', 'magnitmarket', 'mm'].includes(compact)) return 'magnit';
    return ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'product', 'cross'].includes(raw) ? raw : 'cross';
  };
  const stage = (s) => s === 'waiting_decision' ? 3 : s === 'waiting_rop' ? 2 : 1;

  function taskPeopleLine(taskItem) {
    const owner = String(taskItem?.owner || '').trim() || 'без owner';
    const coOwner = String(taskItem?.coOwner || '').trim();
    return coOwner ? `${owner} + ${coOwner}` : owner;
  }

  function taskCreatedLabel(taskItem, compact = false) {
    const raw = taskItem?.createdAt || taskItem?.created_at || '';
    if (!raw) return compact ? 'без даты' : '—';
    if (!compact && typeof fmt !== 'undefined' && typeof fmt.date === 'function') return fmt.date(raw);
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return String(raw).slice(0, 10) || (compact ? 'без даты' : '—');
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  }

  function taskProductStatusLabel(taskItem) {
    const sku = taskItem?.articleKey && typeof getSku === 'function' ? getSku(taskItem.articleKey) : null;
    if (!sku) return '';
    const meta = typeof skuOperationalStatusMeta === 'function'
      ? skuOperationalStatusMeta(sku)
      : (typeof productLifecycleForSku === 'function' ? productLifecycleForSku(sku) : null);
    return meta?.label || sku?.status || '';
  }

  function taskContextCard(taskItem) {
    const sku = taskItem?.articleKey && typeof getSku === 'function' ? getSku(taskItem.articleKey) : null;
    const productStatus = taskProductStatusLabel(taskItem);
    return `
      <div class="card subtle">
        <h3>Контекст</h3>
        ${metricRow('Owner', escapeHtml(taskPeopleLine(taskItem)))}
        ${metricRow('Срок', escapeHtml(taskItem?.due || '—'))}
        ${metricRow('Поставлена', escapeHtml(taskCreatedLabel(taskItem)))}
        ${productStatus ? metricRow('Статус товара', escapeHtml(productStatus)) : ''}
        ${metricRow('SKU / тема', sku ? escapeHtml(sku.article || sku.articleKey) : escapeHtml(taskItem?.entityLabel || 'Общая задача'))}
      </div>`;
  }

  function normalizeMultilineTaskText(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.replace(/\s+$/g, ''))
      .join('\n')
      .trim();
  }

  function parseTaskArticleKeysInput(rawValue) {
    const raw = String(rawValue || '').replace(/\r\n?/g, '\n');
    if (!raw.trim()) return [];
    const result = [];
    const seen = new Set();
    raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const firstCell = line.includes('\t') ? String(line.split('\t')[0] || '').trim() : line;
        if (!firstCell) return;
        const chunks = firstCell.split(/[;,]/).map((part) => part.trim()).filter(Boolean);
        (chunks.length ? chunks : [firstCell]).forEach((chunk) => {
          const token = String(chunk || '').trim().split(/\s+/)[0] || '';
          const normalized = token
            .replace(/^[-•*]+/, '')
            .replace(/^["'`«»]+|["'`«»]+$/g, '')
            .trim();
          if (!normalized) return;
          const key = normalized.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          result.push(normalized);
        });
      });
    return result;
  }

  const TASK_LINK_TASK_PARAM = 'task';
  const TASK_LINK_VIEW_PARAM = 'view';
  const deepLinkState = { handled: false };

  function currentViewForTaskLink() {
    const raw = String(state?.activeView || 'control').trim();
    if (!raw) return 'control';
    if (typeof normalizePortalView === 'function') {
      try {
        return normalizePortalView(raw);
      } catch {}
    }
    return raw;
  }

  function buildTaskShareUrl(taskId) {
    const url = new URL(window.location.href);
    url.searchParams.set(TASK_LINK_TASK_PARAM, String(taskId || ''));
    url.searchParams.set(TASK_LINK_VIEW_PARAM, currentViewForTaskLink());
    return url.toString();
  }

  async function copyTaskShareUrl(taskId) {
    const link = buildTaskShareUrl(taskId);
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
      return link;
    }
    const textarea = document.createElement('textarea');
    textarea.value = link;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (!copied) throw new Error('Copy command failed');
    return link;
  }

  function ensureTaskShareButton(taskId, body) {
    const actions = body.querySelector('.modal-head .badge-stack');
    if (!actions) return;
    let button = actions.querySelector('[data-copy-task-link]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn ghost';
      button.setAttribute('data-copy-task-link', '1');
      button.textContent = 'Копировать ссылку';
      const closeButton = actions.querySelector('[data-close-task-modal]');
      if (closeButton) actions.insertBefore(button, closeButton);
      else actions.appendChild(button);
    }
    if (button.dataset.boundCopyTask === '1') return;
    button.dataset.boundCopyTask = '1';
    button.addEventListener('click', async () => {
      const originalLabel = button.textContent || 'Копировать ссылку';
      button.disabled = true;
      try {
        await copyTaskShareUrl(taskId);
        button.textContent = 'Ссылка скопирована';
      } catch (error) {
        console.error(error);
        button.textContent = 'Ошибка копирования';
      } finally {
        window.setTimeout(() => {
          if (!button.isConnected) return;
          button.disabled = false;
          button.textContent = originalLabel;
        }, 1200);
      }
    });
  }

  function readTaskDeepLink() {
    try {
      const url = new URL(window.location.href);
      const taskId = String(url.searchParams.get(TASK_LINK_TASK_PARAM) || '').trim();
      const rawView = String(url.searchParams.get(TASK_LINK_VIEW_PARAM) || '').trim();
      const view = rawView
        ? (typeof normalizePortalView === 'function' ? normalizePortalView(rawView) : rawView)
        : 'control';
      return { taskId, view };
    } catch (error) {
      console.error(error);
      return { taskId: '', view: 'control' };
    }
  }

  function hasTaskById(taskId) {
    if (!taskId) return false;
    if (typeof getTask === 'function') return Boolean(getTask(taskId));
    if (typeof getAllTasks === 'function') {
      return (getAllTasks() || []).some((item) => String(item?.id || '') === String(taskId));
    }
    return false;
  }

  function tryOpenTaskFromLink(taskId) {
    const openFn = typeof window.openTaskModal === 'function'
      ? window.openTaskModal
      : (typeof openTaskModal === 'function' ? openTaskModal : null);
    if (typeof openFn !== 'function') return false;
    if (!hasTaskById(taskId)) return false;
    openFn(taskId);
    return true;
  }

  function applyTaskDeepLink() {
    if (deepLinkState.handled) return;
    const { taskId, view } = readTaskDeepLink();
    if (!taskId) return;
    if (typeof window.setView === 'function' && view) {
      try { window.setView(view); } catch (error) { console.error(error); }
    }
    let attempts = 0;
    const maxAttempts = 30;
    const tick = () => {
      attempts += 1;
      if (tryOpenTaskFromLink(taskId)) {
        deepLinkState.handled = true;
        return;
      }
      if (attempts < maxAttempts) window.setTimeout(tick, 500);
    };
    window.setTimeout(tick, 120);
  }

  function steps(status) {
    const cur = stage(status);
    const items = [
      ['Исполнитель', 'отчёт'],
      ['РОП', 'согласование'],
      ['Руководитель', 'финал']
    ];
    return `<div class="task-flow">${items.map((item, i) => {
      const n = i + 1;
      const tone = n < cur ? 'done' : n === cur ? 'active' : '';
      return `<div class="task-flow-step ${tone}"><b>${n}</b><span>${item[0]} · ${item[1]}</span></div>`;
    }).join('')}</div>`;
  }

  function lifecycle(taskItem) {
    if (['done', 'cancelled'].includes(taskItem?.status)) return '';
    if (taskItem.status === 'waiting_rop') return `
      <div class="card" style="margin-top:14px">
        ${steps(taskItem.status)}
        <div class="section-subhead">
          <div>
            <h3>Согласование у РОПа</h3>
            <p class="small muted">Ничего не убирали: комментарий, передача руководителю и возврат в работу остались, просто стали чище визуально.</p>
          </div>
          ${badge('шаг 2 из 3', 'warn')}
        </div>
        <div class="ui-note warn"><strong>Что делает РОП</strong>Либо подтверждает результат и передаёт задачу дальше, либо возвращает её в работу с коротким пояснением.</div>
        <form id="taskRopApproveForm" class="form-stack" style="margin-top:12px">
          <label class="ui-field">
            <span class="ui-label">Комментарий РОПа</span>
            <textarea name="comment" rows="3" placeholder="Что согласовали или что нужно поправить"></textarea>
            <span class="ui-hint">Комментарий необязателен, но помогает команде быстро понять решение.</span>
          </label>
          <div class="ui-actions">
            <button class="btn primary" type="submit">Передать руководителю</button>
            <button class="btn ghost" type="button" data-task-return-to-work>Вернуть в работу</button>
          </div>
        </form>
      </div>`;
    if (taskItem.status === 'waiting_decision') return `
      <div class="card" style="margin-top:14px">
        ${steps(taskItem.status)}
        <div class="section-subhead">
          <div>
            <h3>Финальное согласование руководителя</h3>
            <p class="small muted">Финальный комментарий и закрытие задачи на месте, просто собраны в один понятный блок.</p>
          </div>
          ${badge('шаг 3 из 3', 'danger')}
        </div>
        <div class="ui-note ok"><strong>Что делает руководитель</strong>Подтверждает итог по задаче и закрывает её финально.</div>
        <form id="taskFinalCloseForm" class="form-stack" style="margin-top:12px">
          <label class="ui-field">
            <span class="ui-label">Финальный итог</span>
            <textarea name="report" rows="4" placeholder="Что принято и почему задача закрывается" required></textarea>
          </label>
          <button class="btn primary" type="submit">Закрыть задачу финально</button>
        </form>
      </div>`;
    return `
      <div class="card" style="margin-top:14px">
        ${steps(taskItem.status)}
        <div class="section-subhead">
          <div>
            <h3>Сдать результат РОПу</h3>
            <p class="small muted">Маршрут не меняли: исполнитель сдаёт результат, затем задача идёт РОПу и потом руководителю.</p>
          </div>
          ${badge('шаг 1 из 3', 'info')}
        </div>
        <div class="ui-note"><strong>Что делает исполнитель</strong>Фиксирует результат, артефакт или вывод и отправляет задачу на согласование.</div>
        <form id="taskSubmitToRopForm" class="form-stack" style="margin-top:12px">
          <label class="ui-field">
            <span class="ui-label">Отчёт по задаче</span>
            <textarea name="report" rows="4" placeholder="Что сделано и какой результат получен" required></textarea>
            <span class="ui-hint">Коротко: факт выполнения, результат и важное замечание.</span>
          </label>
          <button class="btn primary" type="submit">Отправить РОПу</button>
        </form>
      </div>`;
  }

  function editCard(taskItem, ownerItems) {
    const currentPlatform = normPlatform(taskItem.platform);
    return `
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Редактировать задачу</h3>
            <p class="small muted">Из карточки можно менять owner, сроки, следующий шаг, приоритет и статус.</p>
          </div>
          ${taskItem.articleKey ? taskEntityLine(taskItem, getSku(taskItem.articleKey)) : badge('Общая задача', 'info')}
        </div>
        <datalist id="taskOwnerList">${ownerItems.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
        <form id="taskEditForm" class="form-stack">
          <div class="ui-group">
            <div class="ui-group-head"><strong>Основное</strong><span>Что это за задача, кто её ведёт и какой следующий шаг ждём.</span></div>
            <label class="ui-field"><span class="ui-label">Название задачи</span><input name="title" value="${escapeHtml(taskItem.title || '')}" required></label>
            <div class="ui-grid-3">
              <label class="ui-field"><span class="ui-label">Owner</span><input name="owner" list="taskOwnerList" value="${escapeHtml(taskItem.owner || '')}" placeholder="Кто ведёт"></label>
              <label class="ui-field"><span class="ui-label">Соисполнитель</span><input name="coOwner" list="taskOwnerList" value="${escapeHtml(taskItem.coOwner || '')}" placeholder="Второй менеджер"></label>
              <label class="ui-field"><span class="ui-label">Срок</span><input name="due" type="date" value="${escapeHtml(taskItem.due || '')}"></label>
            </div>
            <label class="ui-field"><span class="ui-label">Следующий шаг</span><textarea name="nextAction" rows="3" placeholder="Что делаем дальше">${escapeHtml(taskItem.nextAction || '')}</textarea></label>
          </div>
          <div class="ui-group">
            <div class="ui-group-head"><strong>Контур и контекст</strong><span>Отдельно выбираем площадку, статус и приоритет, чтобы задачи не смешивались.</span></div>
            <label class="ui-field"><span class="ui-label">Контур</span><select name="platform">
              <option value="cross" ${currentPlatform === 'cross' ? 'selected' : ''}>Общий контур</option>
              <option value="wb" ${currentPlatform === 'wb' ? 'selected' : ''}>РОП WB</option>
              <option value="ozon" ${currentPlatform === 'ozon' ? 'selected' : ''}>РОП Ozon</option>
              <option value="ya" ${currentPlatform === 'ya' ? 'selected' : ''}>Я.Маркет</option>
              <option value="goldapple" ${currentPlatform === 'goldapple' ? 'selected' : ''}>Золотое яблоко</option>
              <option value="letu" ${currentPlatform === 'letu' ? 'selected' : ''}>Л'Этуаль</option>
              <option value="magnit" ${currentPlatform === 'magnit' ? 'selected' : ''}>Магнит Маркет</option>
              <option value="product" ${currentPlatform === 'product' ? 'selected' : ''}>Новинки</option>
            </select></label>
            <div class="ui-grid-3">
              <label class="ui-field"><span class="ui-label">Тема / проект</span><input name="entityLabel" value="${escapeHtml(taskItem.entityLabel || '')}" placeholder="Проект / тема / блок"></label>
              <label class="ui-field"><span class="ui-label">Статус</span><select name="status">${Object.entries(ST).map(([value, label]) => `<option value="${value}" ${taskItem.status === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>
              <label class="ui-field"><span class="ui-label">Приоритет</span><select name="priority">${Object.entries(PRIORITY_META).map(([value, item]) => `<option value="${value}" ${taskItem.priority === value ? 'selected' : ''}>${escapeHtml(item.label || value)}</option>`).join('')}</select></label>
            </div>
            <label class="ui-field"><span class="ui-label">Тип задачи</span><select name="type">
              <option value="general" ${taskItem.type === 'general' ? 'selected' : ''}>Общее</option>
              <option value="launch" ${taskItem.type === 'launch' ? 'selected' : ''}>Новинка / запуск</option>
              <option value="traffic" ${taskItem.type === 'traffic' ? 'selected' : ''}>Трафик / продвижение</option>
              <option value="content" ${taskItem.type === 'content' ? 'selected' : ''}>Контент / карточка</option>
              <option value="assignment" ${taskItem.type === 'assignment' ? 'selected' : ''}>Закрепление</option>
            </select></label>
            <label class="ui-field"><span class="ui-label">Контекст</span><textarea name="reason" rows="3" placeholder="Почему задача возникла и что важно учитывать">${escapeHtml(taskItem.reason || '')}</textarea></label>
          </div>
          <button class="btn primary" type="submit">Сохранить изменения</button>
        </form>
      </div>`;
  }
  function updatesCard(taskItem, items) {
    const rows = items.length ? items.map((item) => `
      <div class="comment-item">
        <div class="head">
          <strong>${escapeHtml(item.author || 'Команда')}</strong>
          <div class="badge-stack">${badge(item.kind === 'report' ? 'Отчёт' : item.kind === 'status' ? 'Статус' : item.kind === 'updated' ? 'Изменена' : item.kind === 'created' ? 'Создана' : 'Комментарий', item.kind === 'report' ? 'ok' : item.kind === 'updated' ? 'warn' : 'info')}${badge(item.team || 'Команда')}</div>
        </div>
        <div class="muted small">${fmt.date(item.createdAt)}</div>
        <p>${escapeHtml(item.text || '—')}</p>
      </div>`).join('') : `<div class="comment-item"><div class="head"><strong>Портал</strong>${badge('Создана', 'info')}</div><div class="muted small">${fmt.date(taskItem.createdAt)}</div><p>История пока пустая. Первый апдейт появится здесь.</p></div>`;
    return `
      <div class="card">
        <div class="section-subhead">
          <div>
            <h3>Апдейты</h3>
          </div>
          ${badge(`${fmt.int(items.length)} записей`, items.length ? 'info' : 'ok')}
        </div>
        <div class="ui-stack">
          ${taskAttachmentsCard(taskItem, { embedded: true })}
          <div class="compact-history">${rows}</div>
          <div class="ui-group">
            <div class="ui-group-head"><strong>Новый апдейт</strong><span>Коротко зафиксируй факт, блокер или следующий шаг по задаче.</span></div>
            <form id="taskCommentForm" class="form-stack">
              <label class="ui-field"><span class="ui-label">Комментарий</span><textarea name="text" rows="3" placeholder="Например: обновили карточку, ждём макет, согласовали цену" required></textarea></label>
              <button class="btn" type="submit">Сохранить апдейт</button>
            </form>
          </div>
        </div>
      </div>`;
  }

  function taskAttachmentSizeLabel(size = 0) {
    const bytes = Number(size || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
  }

  function taskAttachmentHref(item) {
    const direct = String(item?.publicUrl || '').trim();
    if (direct) return direct;
    if (typeof taskAttachmentPublicUrl === 'function') {
      return taskAttachmentPublicUrl(item?.bucket || '', item?.objectPath || '');
    }
    return '';
  }

  function taskAttachmentsCard(taskItem, options = {}) {
    const taskId = String(taskItem?.id || '').trim();
    const embedded = options.embedded === true;
    const attachments = typeof getTaskAttachments === 'function' ? getTaskAttachments(taskId) : [];
    const allowed = typeof TASK_ATTACHMENT_ALLOWED_EXTENSIONS !== 'undefined' && Array.isArray(TASK_ATTACHMENT_ALLOWED_EXTENSIONS)
      ? TASK_ATTACHMENT_ALLOWED_EXTENSIONS.join(', ')
      : 'xlsx, xls, csv';
    const limit = typeof TASK_ATTACHMENT_MAX_BYTES !== 'undefined'
      ? Math.round(TASK_ATTACHMENT_MAX_BYTES / (1024 * 1024))
      : 20;
    const rows = attachments.length ? attachments.map((item) => {
      const href = taskAttachmentHref(item);
      const size = taskAttachmentSizeLabel(item.size);
      const meta = [
        size,
        item.createdBy ? `\u043e\u0442 ${escapeHtml(item.createdBy)}` : '',
        item.createdAt ? fmt.date(item.createdAt) : ''
      ].filter(Boolean).join(' \u00b7 ');
      return `
        <div class="task-attachment-row">
          <div class="task-attachment-main">
            <strong>${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(item.fileName || '\u0424\u0430\u0439\u043b')}</a>` : escapeHtml(item.fileName || '\u0424\u0430\u0439\u043b')}</strong>
            <span>${escapeHtml(meta || '\u0432\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043a \u0437\u0430\u0434\u0430\u0447\u0435')}</span>
          </div>
          <div class="task-attachment-actions">
            ${href ? `<a class="btn ghost small-btn" href="${escapeHtml(href)}" target="_blank" rel="noopener">\u041e\u0442\u043a\u0440\u044b\u0442\u044c</a>` : ''}
            <button class="btn ghost small-btn" type="button" data-task-attachment-delete="${escapeHtml(item.id)}">\u0423\u0434\u0430\u043b\u0438\u0442\u044c</button>
          </div>
        </div>`;
    }).join('') : '<div class="empty compact">\u0424\u0430\u0439\u043b\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442</div>';
    return `
      <div class="${embedded ? 'task-attachments-card task-attachments-panel' : 'card task-attachments-card'}" data-task-attachments-card>
        <div class="section-subhead">
          <div>
            <h3>\u0424\u0430\u0439\u043b\u044b \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u0430</h3>
            <p class="small muted">\u041f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u0435 Excel/CSV \u043a\u0430\u043a \u0430\u0440\u0442\u0435\u0444\u0430\u043a\u0442 \u0440\u0430\u0431\u043e\u0442\u044b. \u041e\u043d \u0431\u0443\u0434\u0435\u0442 \u0432\u0438\u0434\u0435\u043d \u0432 \u044d\u0442\u043e\u0439 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0435.</p>
          </div>
          ${badge(`${fmt.int(attachments.length)} \u0444\u0430\u0439\u043b.`, attachments.length ? 'info' : 'ok')}
        </div>
        <div class="ui-stack">
          <div class="task-attachment-list">${rows}</div>
          <div class="task-attachment-upload">
            <label class="btn file-input" data-task-attachment-picker>
              <span data-task-attachment-label>\u041f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u0444\u0430\u0439\u043b</span>
              <input type="file" data-task-attachment-input accept=".xlsx,.xls,.csv">
            </label>
            <span class="ui-hint">\u0424\u043e\u0440\u043c\u0430\u0442\u044b: ${escapeHtml(allowed)} \u00b7 \u0434\u043e ${fmt.int(limit)} MB</span>
          </div>
        </div>
      </div>`;
  }

  function generalCard(selected, ownerItems, approvalCount) {
    const fixed = selected && selected !== 'all';
    const platform = fixed ? selected : 'cross';
    const entity = fixed ? meta(selected).label : '';
    return `
      <div class="card" data-control-refine-form-card>
        <div class="section-subhead">
          <div>
            <h3>Поставить новую задачу</h3>
            <p class="small muted">Функционал не сокращали: все поля сохранены, просто теперь они на виду и сгруппированы по смыслу.</p>
          </div>
          ${badge(`${fmt.int(approvalCount)} на согласовании`, approvalCount ? 'warn' : 'ok')}
        </div>
        <datalist id="generalTaskOwnerList">${ownerItems.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
        <form id="generalTaskForm" class="form-stack">
          <div class="ui-group">
            <div class="ui-group-head"><strong>Основное</strong><span>Что делаем, кто отвечает, в каком контуре живёт задача и какой первый шаг нужен сразу.</span></div>
            <label class="ui-field"><span class="ui-label">Название задачи</span><input name="title" placeholder="Что нужно сделать" required></label>
            <div class="ui-grid-3">
              <label class="ui-field"><span class="ui-label">Owner</span><input name="owner" list="generalTaskOwnerList" placeholder="Кто ведёт задачу"></label>
              <label class="ui-field"><span class="ui-label">Соисполнитель</span><input name="coOwner" list="generalTaskOwnerList" placeholder="Второй менеджер"></label>
              <label class="ui-field"><span class="ui-label">Срок</span><input name="due" type="date" value="${plusDays(2)}"></label>
          ${fixed ? `<div class="ui-note"><strong>Контур задачи</strong>${escapeHtml(meta(platform).label)}<input type="hidden" name="platform" value="${escapeHtml(platform)}"></div>` : `<label class="ui-field"><span class="ui-label">Контур</span><select name="platform"><option value="cross" ${platform === 'cross' ? 'selected' : ''}>Общий контур</option><option value="wb">РОП WB</option><option value="ozon">РОП Ozon</option><option value="ya">Я.Маркет</option><option value="goldapple">Золотое яблоко</option><option value="letu">Л'Этуаль</option><option value="magnit">Магнит Маркет</option><option value="product">Новинки</option></select></label>`}
            </div>
            <label class="ui-field"><span class="ui-label">Первый шаг</span><textarea name="nextAction" rows="3" placeholder="Что делаем первым действием" required></textarea></label>
            <label class="ui-field"><span class="ui-label">Артикулы для массовой постановки</span><textarea name="articleKeys" rows="4" placeholder="По одному SKU на строку, можно вставить столбец из Excel&#10;Пример:&#10;curly_method_300ml&#10;retinait_krem_05_50ml"></textarea><span class="ui-hint">Если поле заполнено, будет создана отдельная задача на каждый SKU.</span></label>
          </div>
          <div class="ui-group">
            <div class="ui-group-head"><strong>Контекст и классификация</strong><span>Тема, тип, приоритет и пояснение по задаче остаются в карточке и видны сразу.</span></div>
            <div class="ui-grid-3">
              <label class="ui-field"><span class="ui-label">Тема / проект</span><input name="entityLabel" placeholder="Проект / тема / блок" value="${escapeHtml(entity)}"></label>
              <label class="ui-field"><span class="ui-label">Приоритет</span><select name="priority">${Object.entries(PRIORITY_META).map(([value, item]) => `<option value="${value}" ${value === 'high' ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}</select></label>
              <label class="ui-field"><span class="ui-label">Тип задачи</span><select name="type"><option value="general">Общее</option><option value="launch">Новинка / запуск</option><option value="traffic">Трафик / продвижение</option><option value="content">Контент / карточка</option><option value="assignment">Закрепление</option></select></label>
            </div>
            <label class="ui-field"><span class="ui-label">Контекст</span><textarea name="reason" rows="3" placeholder="Почему возникла задача и что важно знать"></textarea></label>
          </div>
          <button class="btn primary" type="submit">Поставить задачу</button>
        </form>
      </div>`;
  }

  function bindTaskModal(taskId, body) {
    body.querySelector('#taskEditForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const updateFn = typeof window.updateTaskRecordSafe === 'function'
        ? window.updateTaskRecordSafe
        : (typeof updateTaskRecord === 'function' ? updateTaskRecord : null);
      if (!updateFn) {
        alert('Функция сохранения задачи недоступна. Обновите страницу.');
        return;
      }
      const updatedTask = await updateFn(taskId, {
        title: form.get('title'),
        entityLabel: form.get('entityLabel'),
        owner: form.get('owner'),
        coOwner: form.get('coOwner'),
        due: form.get('due'),
        status: form.get('status'),
        priority: form.get('priority'),
        type: form.get('type'),
        platform: form.get('platform'),
        nextAction: form.get('nextAction'),
        reason: form.get('reason')
      });
      if (!updatedTask) {
        alert('Не удалось сохранить задачу. Обновите страницу и повторите.');
        return;
      }
      renderTaskModal(taskId);
    });
    body.querySelector('#taskCommentForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const text = String(form.get('text') || '').trim();
      if (!text) return;
      const historyFn = typeof window.appendTaskHistorySafe === 'function'
        ? window.appendTaskHistorySafe
        : (typeof createTaskHistoryEntry === 'function' ? createTaskHistoryEntry : null);
      if (!historyFn) {
        alert('Функция сохранения апдейта недоступна. Обновите страницу.');
        return;
      }
      await historyFn(taskId, 'comment', text, { team: typeof teamMemberLabel === 'function' ? teamMemberLabel() : 'Команда' });
      renderTaskModal(taskId);
    });
    const submitToRopForm = body.querySelector('#taskSubmitToRopForm') || body.querySelector('#taskCloseForm');
    if (submitToRopForm && submitToRopForm.dataset.ropSubmitBound !== '1') {
      submitToRopForm.dataset.ropSubmitBound = '1';
      submitToRopForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        if (submitToRopForm.dataset.sending === '1' || stepSubmitInFlight.has(taskId)) return;
        const form = new FormData(event.currentTarget);
        const report = String(form.get('report') || '').trim();
        if (!report) {
          event.currentTarget.querySelector('textarea[name="report"]')?.focus();
          return;
        }
        const submitButton = event.currentTarget.querySelector('button[type="submit"]');
        const initialText = submitButton?.textContent || '';
        try {
          submitToRopForm.dataset.sending = '1';
          if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Отправляем...';
          }
          const submitFn = typeof window.submitTaskForRopApproval === 'function'
            ? window.submitTaskForRopApproval
            : (typeof submitTaskForRopApproval === 'function' ? submitTaskForRopApproval : null);
          if (typeof submitFn !== 'function') throw new Error('Функция отправки РОПу недоступна.');
          const updatedTask = await submitFn(taskId, report);
          if (!updatedTask) throw new Error('Не удалось найти задачу в текущем слое.');
          renderTaskModal(taskId);
        } catch (error) {
          console.error(error);
          alert(error?.message || 'Не удалось отправить задачу РОПу. Повторите попытку.');
        } finally {
          submitToRopForm.dataset.sending = '0';
          if (submitButton && submitButton.isConnected) {
            submitButton.disabled = false;
            submitButton.textContent = initialText || 'Отправить РОПу';
          }
        }
      });
    }
    body.querySelector('#taskRopApproveForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      try {
        const updatedTask = await approveTaskByRop(taskId, String(form.get('comment') || '').trim());
        if (!updatedTask) {
          alert('Не удалось согласовать задачу: комментарий/статус не синхронизировались. Повторите после обновления.');
          return;
        }
        renderTaskModal(taskId);
      } catch (error) {
        console.error(error);
        alert(error?.message || 'Ошибка согласования у РОПа. Повторите после обновления.');
      }
    });
    body.querySelector('[data-task-return-to-work]')?.addEventListener('click', async () => {
      const comment = String(body.querySelector('#taskRopApproveForm textarea[name="comment"]')?.value || '').trim();
      try {
        const updatedTask = await returnTaskToWork(taskId, comment);
        if (!updatedTask) {
          alert('Не удалось вернуть задачу: комментарий/статус не синхронизировались. Повторите после обновления.');
          return;
        }
        renderTaskModal(taskId);
      } catch (error) {
        console.error(error);
        alert(error?.message || 'Ошибка возврата задачи в работу. Повторите после обновления.');
      }
    });
    body.querySelector('#taskFinalCloseForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const report = String(form.get('report') || '').trim();
      if (!report) return;
      try {
        const updatedTask = await closeTaskWithReport(taskId, report);
        if (!updatedTask) {
          alert('Не удалось финально закрыть задачу: отчёт/статус не синхронизировались. Повторите после обновления.');
          return;
        }
        renderTaskModal(taskId);
      } catch (error) {
        console.error(error);
        alert(error?.message || 'Ошибка финального закрытия. Повторите после обновления.');
      }
    });
  }

  function bindTaskModal(taskId, body) {
    const bindOnce = (element, flag, handler) => {
      if (!element) return;
      if (element.dataset?.[flag] === '1') return;
      if (element.dataset) element.dataset[flag] = '1';
      element.addEventListener('submit', handler);
    };

    const editForm = body.querySelector('#taskEditForm');
    bindOnce(editForm, 'boundEditRefine', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const updateFn = typeof window.updateTaskRecordSafe === 'function'
        ? window.updateTaskRecordSafe
        : (typeof updateTaskRecord === 'function' ? updateTaskRecord : null);
      if (!updateFn) {
        alert('Task save function is unavailable. Refresh the page.');
        return;
      }
      const updatedTask = await updateFn(taskId, {
        title: form.get('title'),
        entityLabel: form.get('entityLabel'),
        owner: form.get('owner'),
        coOwner: form.get('coOwner'),
        due: form.get('due'),
        status: form.get('status'),
        priority: form.get('priority'),
        type: form.get('type'),
        platform: form.get('platform'),
        nextAction: form.get('nextAction'),
        reason: form.get('reason')
      });
      if (!updatedTask) {
        alert('Task was not saved. Refresh and retry.');
        return;
      }
      if (typeof pullRemoteState === 'function') {
        try { await pullRemoteState(false); } catch (error) { console.error(error); }
      }
      renderTaskModal(taskId);
    });

    body.querySelectorAll('[data-task-modal-due]').forEach((button) => {
      if (button.dataset.boundModalDue === '1') return;
      button.dataset.boundModalDue = '1';
      button.addEventListener('click', async () => {
        const days = Number(button.dataset.taskModalDue || 0);
        const dueInput = body.querySelector('#taskEditForm input[name="due"]');
        const due = plusDays(Number.isFinite(days) ? days : 0);
        if (dueInput) dueInput.value = due;
        const updateFn = typeof window.updateTaskRecordSafe === 'function'
          ? window.updateTaskRecordSafe
          : (typeof updateTaskRecord === 'function' ? updateTaskRecord : null);
        if (typeof updateFn === 'function') {
          await updateFn(taskId, { due });
          renderTaskModal(taskId);
        }
      });
    });

    const commentForm = body.querySelector('#taskCommentForm');
    bindOnce(commentForm, 'boundCommentRefine', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const text = String(form.get('text') || '').trim();
      if (!text) return;
      const historyFn = typeof window.appendTaskHistorySafe === 'function'
        ? window.appendTaskHistorySafe
        : (typeof createTaskHistoryEntry === 'function' ? createTaskHistoryEntry : null);
      if (!historyFn) {
        alert('Comment save function is unavailable. Refresh the page.');
        return;
      }
      const saved = await historyFn(taskId, 'comment', text, {
        team: typeof teamMemberLabel === 'function' ? teamMemberLabel() : 'Team'
      });
      if (!saved) {
        alert('Comment was not synced. Refresh and retry.');
        return;
      }
      if (typeof pullRemoteState === 'function') {
        try { await pullRemoteState(false); } catch (error) { console.error(error); }
      }
      renderTaskModal(taskId);
    });

    const attachmentInput = body.querySelector('[data-task-attachment-input]');
    if (attachmentInput && attachmentInput.dataset.boundAttachmentUpload !== '1') {
      attachmentInput.dataset.boundAttachmentUpload = '1';
      attachmentInput.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const label = body.querySelector('[data-task-attachment-label]');
        const picker = body.querySelector('[data-task-attachment-picker]');
        const initialLabel = label?.textContent || '';
        try {
          attachmentInput.disabled = true;
          if (picker) picker.classList.add('is-loading');
          if (label) label.textContent = '\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c...';
          const uploadFn = typeof window.uploadTaskAttachment === 'function'
            ? window.uploadTaskAttachment
            : (typeof uploadTaskAttachment === 'function' ? uploadTaskAttachment : null);
          if (typeof uploadFn !== 'function') throw new Error('\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0444\u0430\u0439\u043b\u043e\u0432 \u0435\u0449\u0435 \u043d\u0435 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0430.');
          const attachment = await uploadFn(taskId, file);
          const historyFn = typeof window.appendTaskHistorySafe === 'function'
            ? window.appendTaskHistorySafe
            : (typeof createTaskHistoryEntry === 'function' ? createTaskHistoryEntry : null);
          if (typeof historyFn === 'function') {
            try {
              await historyFn(taskId, 'comment', `\u041f\u0440\u0438\u043b\u043e\u0436\u0435\u043d \u0444\u0430\u0439\u043b: ${attachment?.fileName || file.name}`, {
                team: typeof teamMemberLabel === 'function' ? teamMemberLabel() : 'Team'
              });
            } catch (error) {
              console.error(error);
            }
          }
          renderTaskModal(taskId);
        } catch (error) {
          console.error(error);
          alert(error?.message || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u0444\u0430\u0439\u043b.');
        } finally {
          if (attachmentInput.isConnected) {
            attachmentInput.value = '';
            attachmentInput.disabled = false;
          }
          if (picker) picker.classList.remove('is-loading');
          if (label && label.isConnected) label.textContent = initialLabel || '\u041f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u0444\u0430\u0439\u043b';
        }
      });
    }

    body.querySelectorAll('[data-task-attachment-delete]').forEach((button) => {
      if (button.dataset.boundAttachmentDelete === '1') return;
      button.dataset.boundAttachmentDelete = '1';
      button.addEventListener('click', async () => {
        const attachmentId = String(button.dataset.taskAttachmentDelete || '').trim();
        if (!attachmentId) return;
        if (!window.confirm('\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u044d\u0442\u043e\u0442 \u0444\u0430\u0439\u043b \u0438\u0437 \u0437\u0430\u0434\u0430\u0447\u0438?')) return;
        const initialText = button.textContent || '';
        try {
          button.disabled = true;
          button.textContent = '\u0423\u0434\u0430\u043b\u044f\u0435\u043c...';
          const deleteFn = typeof window.deleteTaskAttachment === 'function'
            ? window.deleteTaskAttachment
            : (typeof deleteTaskAttachment === 'function' ? deleteTaskAttachment : null);
          if (typeof deleteFn !== 'function') throw new Error('\u0423\u0434\u0430\u043b\u0435\u043d\u0438\u0435 \u0444\u0430\u0439\u043b\u043e\u0432 \u0435\u0449\u0435 \u043d\u0435 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u043e.');
          await deleteFn(attachmentId);
          renderTaskModal(taskId);
        } catch (error) {
          console.error(error);
          alert(error?.message || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0443\u0434\u0430\u043b\u0438\u0442\u044c \u0444\u0430\u0439\u043b.');
        } finally {
          if (button.isConnected) {
            button.disabled = false;
            button.textContent = initialText || '\u0423\u0434\u0430\u043b\u0438\u0442\u044c';
          }
        }
      });
    });

    const submitToRopForm = body.querySelector('#taskSubmitToRopForm') || body.querySelector('#taskCloseForm');
    if (submitToRopForm && submitToRopForm.dataset.ropSubmitBound !== '1') {
      submitToRopForm.dataset.ropSubmitBound = '1';
      submitToRopForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        if (submitToRopForm.dataset.sending === '1' || stepSubmitInFlight.has(taskId)) return;
        const form = new FormData(event.currentTarget);
        const report = String(form.get('report') || '').trim();
        if (!report) {
          event.currentTarget.querySelector('textarea[name="report"]')?.focus();
          return;
        }
        const submitButton = event.currentTarget.querySelector('button[type="submit"]');
        const initialText = submitButton?.textContent || '';
        try {
          stepSubmitInFlight.add(taskId);
          submitToRopForm.dataset.sending = '1';
          if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Передаём РОПу...';
          }
          const submitFn = typeof window.submitTaskForRopApproval === 'function'
            ? window.submitTaskForRopApproval
            : (typeof submitTaskForRopApproval === 'function' ? submitTaskForRopApproval : null);
          if (typeof submitFn !== 'function') throw new Error('Submit function is unavailable.');
          const updatedTask = await submitFn(taskId, report);
          if (!updatedTask) throw new Error('Task state was not synced.');
          renderTaskModal(taskId);
        } catch (error) {
          console.error(error);
          alert(error?.message || 'Failed to send task to ROP.');
        } finally {
          stepSubmitInFlight.delete(taskId);
          submitToRopForm.dataset.sending = '0';
          if (submitButton && submitButton.isConnected) {
            submitButton.disabled = false;
            submitButton.textContent = initialText || 'Отправить РОПу';
          }
        }
      });
    }

    const ropApproveForm = body.querySelector('#taskRopApproveForm');
    bindOnce(ropApproveForm, 'boundRopApproveRefine', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      if (ropApproveForm.dataset.sending === '1' || stepApproveInFlight.has(taskId)) return;
      const form = new FormData(event.currentTarget);
      const submitButton = event.currentTarget.querySelector('button[type="submit"]');
      const initialText = submitButton?.textContent || '';
      try {
        stepApproveInFlight.add(taskId);
        ropApproveForm.dataset.sending = '1';
        if (submitButton) {
          submitButton.disabled = true;
          submitButton.textContent = 'Передаём руководителю...';
        }
        const approveFn = typeof window.approveTaskByRop === 'function'
          ? window.approveTaskByRop
          : (typeof approveTaskByRop === 'function' ? approveTaskByRop : null);
        if (typeof approveFn !== 'function') throw new Error('Approve function is unavailable.');
        const updatedTask = await approveFn(taskId, String(form.get('comment') || '').trim());
        if (!updatedTask) {
          alert('Status was not synced. Refresh and retry.');
          return;
        }
        renderTaskModal(taskId);
      } catch (error) {
        console.error(error);
        alert(error?.message || 'Approval failed. Refresh and retry.');
      } finally {
        stepApproveInFlight.delete(taskId);
        ropApproveForm.dataset.sending = '0';
        if (submitButton && submitButton.isConnected) {
          submitButton.disabled = false;
          submitButton.textContent = initialText || 'Передать руководителю';
        }
      }
    });

    const returnButton = body.querySelector('[data-task-return-to-work]');
    if (returnButton && returnButton.dataset.boundReturnRefine !== '1') {
      returnButton.dataset.boundReturnRefine = '1';
      returnButton.addEventListener('click', async () => {
        if (returnButton.dataset.sending === '1' || stepReturnInFlight.has(taskId)) return;
        const comment = String(body.querySelector('#taskRopApproveForm textarea[name="comment"]')?.value || '').trim();
        const initialText = returnButton.textContent || '';
        try {
          stepReturnInFlight.add(taskId);
          returnButton.dataset.sending = '1';
          returnButton.disabled = true;
          returnButton.textContent = 'Возвращаем...';
          const returnFn = typeof window.returnTaskToWork === 'function'
            ? window.returnTaskToWork
            : (typeof returnTaskToWork === 'function' ? returnTaskToWork : null);
          if (typeof returnFn !== 'function') throw new Error('Return function is unavailable.');
          const updatedTask = await returnFn(taskId, comment);
          if (!updatedTask) {
            alert('Task was not returned in shared layer. Refresh and retry.');
            return;
          }
          renderTaskModal(taskId);
        } catch (error) {
          console.error(error);
          alert(error?.message || 'Failed to return task to work.');
        } finally {
          stepReturnInFlight.delete(taskId);
          returnButton.dataset.sending = '0';
          if (returnButton.isConnected) {
            returnButton.disabled = false;
            returnButton.textContent = initialText || 'Вернуть в работу';
          }
        }
      });
    }

    const finalCloseForm = body.querySelector('#taskFinalCloseForm');
    bindOnce(finalCloseForm, 'boundFinalRefine', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      if (finalCloseForm.dataset.sending === '1' || finalCloseInFlight.has(taskId)) return;
      const form = new FormData(event.currentTarget);
      const report = String(form.get('report') || '').trim();
      if (!report) return;
      const submitButton = event.currentTarget.querySelector('button[type="submit"]');
      const initialText = submitButton?.textContent || '';
      try {
        finalCloseInFlight.add(taskId);
        finalCloseForm.dataset.sending = '1';
        if (submitButton) {
          submitButton.disabled = true;
          submitButton.textContent = 'Закрываем...';
        }
        const closeFn = typeof window.closeTaskWithReport === 'function'
          ? window.closeTaskWithReport
          : (typeof closeTaskWithReport === 'function' ? closeTaskWithReport : null);
        if (typeof closeFn !== 'function') throw new Error('Final close function is unavailable.');
        const updatedTask = await closeFn(taskId, report);
        if (!updatedTask) {
          alert('Task was not closed in shared layer. Refresh and retry.');
          return;
        }
        renderTaskModal(taskId);
      } catch (error) {
        console.error(error);
        alert(error?.message || 'Final close failed. Refresh and retry.');
      } finally {
        finalCloseInFlight.delete(taskId);
        finalCloseForm.dataset.sending = '0';
        if (submitButton && submitButton.isConnected) {
          submitButton.disabled = false;
          submitButton.textContent = initialText || 'Закрыть задачу финально';
        }
      }
    });
  }

  function taskModalRefined(taskId, skipRemoteSync = false) {
    if (!baseTaskModal) return;
    baseTaskModal(taskId);
    const taskItem = task(taskId);
    const body = document.getElementById('taskModalBody');
    if (!taskItem || !body) return;
    ensureTaskShareButton(taskId, body);
    const cardsRoot = body.querySelector('.two-col');
    const cards = cardsRoot ? Array.from(cardsRoot.children).filter((node) => node.classList?.contains('card')) : [];
    const lifecycleCard = body.querySelector('#taskFinalCloseForm, #taskRopApproveForm, #taskSubmitToRopForm, #taskCloseForm')?.closest('.card');
    if (lifecycleCard) lifecycleCard.outerHTML = lifecycle(taskItem);
    const summaryGrid = body.querySelector('.kv-3');
    if (summaryGrid) {
      summaryGrid.innerHTML = taskContextCard(taskItem);
      summaryGrid.style.gridTemplateColumns = 'minmax(0, 1fr)';
    }
    if (cards[0]) cards[0].outerHTML = editCard(taskItem, owners());
    if (cards[1]) cards[1].outerHTML = updatesCard(taskItem, history(taskId));
    if (!body.querySelector('[data-task-attachments-card]')) {
      const attachmentHtml = taskAttachmentsCard(taskItem);
      if (cardsRoot) cardsRoot.insertAdjacentHTML('afterend', attachmentHtml);
      else if (summaryGrid) summaryGrid.insertAdjacentHTML('afterend', attachmentHtml);
    }
    bindTaskModal(taskId, body);
  }

  function ownerRows(rows) {
    const max = Math.max(1, rows[0]?.total || 1);
    return rows.map((row) => `
      <div class="owner-row">
        <div class="head">
          <strong>${escapeHtml(row.owner)}</strong>
          <div class="badge-stack">${badge(`${fmt.int(row.total)} задач`)}${row.overdue ? badge(`${fmt.int(row.overdue)} проср.`, 'danger') : ''}${row.critical ? badge(`${fmt.int(row.critical)} крит.`, 'warn') : ''}</div>
        </div>
        <div class="owner-bar"><span style="width:${Math.max(8, Math.round((row.total / max) * 100))}%"></span></div>
      </div>`).join('');
  }

  function executiveTaskWorkstream(taskItem) {
    const sku = taskItem?.articleKey && typeof getSku === 'function' ? getSku(taskItem.articleKey) : null;
    if (typeof controlWorkstreamKey === 'function') return normPlatform(controlWorkstreamKey(taskItem, sku));
    return normPlatform(taskItem?.platform);
  }

  function executivePlatformRows(active) {
    return EXEC_PLATFORM_KEYS.map((key) => {
      const items = active.filter((item) => executiveTaskWorkstream(item) === key);
      const overdue = items.filter((item) => typeof isTaskOverdue === 'function' ? isTaskOverdue(item) : false);
      const waitingRop = items.filter((item) => item.status === 'waiting_rop');
      const waitingFinal = items.filter((item) => item.status === 'waiting_decision');
      const critical = items.filter((item) => item.priority === 'critical');
      return {
        key,
        meta: meta(key),
        items,
        overdue,
        waitingRop,
        waitingFinal,
        critical,
        noOwner: items.filter((item) => !item.owner)
      };
    }).sort((a, b) => {
      const riskA = a.overdue.length * 4 + a.critical.length * 3 + a.waitingFinal.length * 2 + a.waitingRop.length;
      const riskB = b.overdue.length * 4 + b.critical.length * 3 + b.waitingFinal.length * 2 + b.waitingRop.length;
      return riskB - riskA || b.items.length - a.items.length || EXEC_PLATFORM_KEYS.indexOf(a.key) - EXEC_PLATFORM_KEYS.indexOf(b.key);
    });
  }

  function executivePlatformCard(row) {
    const risk = row.overdue.length || row.critical.length || row.waitingFinal.length || row.waitingRop.length;
    const statusTone = row.overdue.length || row.critical.length ? 'danger' : row.waitingFinal.length || row.waitingRop.length ? 'warn' : row.items.length ? 'info' : 'ok';
    const statusText = row.overdue.length
      ? `${fmt.int(row.overdue.length)} проср.`
      : row.critical.length
        ? `${fmt.int(row.critical.length)} крит.`
        : row.waitingFinal.length
          ? `${fmt.int(row.waitingFinal.length)} финал`
          : row.waitingRop.length
            ? `${fmt.int(row.waitingRop.length)} у РОПа`
            : row.items.length ? `${fmt.int(row.items.length)} актив.` : 'чисто';
    return `
      <div class="card executive-platform-card ${risk ? 'has-risk' : ''} ${row.items.length ? '' : 'is-empty'}" data-executive-platform-card="${escapeHtml(row.key)}">
        <div class="executive-platform-head">
          <div>
            <span>${escapeHtml(row.meta.label)}</span>
            <strong>${escapeHtml(row.meta.chip)}</strong>
          </div>
          ${badge(statusText, statusTone)}
        </div>
        <div class="executive-platform-metrics">
          <span><b>${fmt.int(row.items.length)}</b> активных</span>
          <span><b>${fmt.int(row.waitingRop.length)}</b> РОП</span>
          <span><b>${fmt.int(row.waitingFinal.length)}</b> финал</span>
          <span><b>${fmt.int(row.noOwner.length)}</b> без owner</span>
        </div>
        <button class="btn ghost small-btn" type="button" data-executive-open-workstream="${escapeHtml(row.key)}">Открыть задачи</button>
      </div>`;
  }

  const CONTROL_SIMPLE_TITLE = 'Выберите площадку, дальше работайте только с её задачами. Обзор по всем показывает контуры отдельно.';
  const CONTROL_SIMPLE_DIRECTIONS = [
    ['all', 'Все', 'весь контур'],
    ['wb', 'WB', 'РОП WB'],
    ['ozon', 'Ozon', 'РОП Ozon'],
    ['ya', 'Я.Маркет', 'маркетплейс'],
    ['goldapple', 'ЗЯ', 'Золотое яблоко'],
    ['letu', "Л'Этуаль", 'сеть'],
    ['magnit', 'Магнит', 'сеть'],
    ['product', 'Продукт', 'новинки'],
    ['cross', 'Общие', 'без площадки']
  ];
  const CONTROL_SIMPLE_META = Object.fromEntries(CONTROL_SIMPLE_DIRECTIONS.map(([key, label, hint]) => [key, { label, hint }]));
  const CONTROL_SIMPLE_WORKSPACE_ORDER = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'product', 'cross'];
  const CONTROL_SIMPLE_DIRECTION_RENDER_ORDER = ['all', ...CONTROL_SIMPLE_WORKSPACE_ORDER];
  const CONTROL_SIMPLE_QUEUES = [
    ['new', 'Новые задачи', 'Что взять в работу сейчас'],
    ['signals', 'Автосигналы', 'Портал нашёл риск сам'],
    ['common', 'Задачи общие', 'Без привязки к одной карточке'],
    ['sent', 'Отправленные', 'Ждут РОПа, отдела или финала'],
    ['confirmed', 'Подтвержденные', 'Уже закрыто и зафиксировано']
  ];
  const CONTROL_SIMPLE_ACTIVE = new Set(['new', 'in_progress', 'waiting_team', 'waiting_rop', 'waiting_decision']);
  const CONTROL_SIMPLE_SENT = new Set(['waiting_team', 'waiting_rop', 'waiting_decision']);

  function controlSimpleNormalizeQueue(value) {
    const raw = String(value || 'all').trim().toLowerCase();
    if (raw === 'all') return 'all';
    return CONTROL_SIMPLE_QUEUES.some(([key]) => key === raw) ? raw : 'all';
  }

  function controlSimpleQueueTone(key) {
    if (key === 'sent') return 'warn';
    if (key === 'signals') return 'info';
    if (key === 'confirmed') return 'ok';
    return '';
  }

  function controlSimpleNormalizeDirection(value) {
    const raw = String(value || 'all').trim().toLowerCase();
    const inferred = inferMarketplaceKey(raw);
    if (inferred) return inferred;
    if (raw === 'retail') return 'cross';
    if (['wb+ozon', 'common', 'general', 'shared'].includes(raw)) return 'cross';
    return CONTROL_SIMPLE_META[raw] ? raw : 'all';
  }

  function controlSimpleSelectedDirection(counts = null) {
    const filters = state?.controlFilters || {};
    const role = controlSimpleNormalizeDirection(filters.peopleRole);
    if (role !== 'all' && role !== 'cross') return role;
    const platform = controlSimpleNormalizeDirection(filters.platform || 'all');
    if (platform !== 'all') return platform;
    if (filters.taskSimpleWorkspaceChosen) return 'all';
    if (counts && typeof counts === 'object') {
      const firstWithWork = CONTROL_SIMPLE_WORKSPACE_ORDER.find((key) => Number(counts[key] || 0) > 0);
      if (firstWithWork) return firstWithWork;
    }
    return 'wb';
  }

  function controlSimpleAllTasks() {
    try {
      if (typeof getControlSnapshot === 'function') {
        const snapshot = getControlSnapshot();
        if (Array.isArray(snapshot?.tasks)) return snapshot.tasks;
        if (Array.isArray(snapshot?.active)) return snapshot.active;
      }
    } catch {}
    try {
      if (typeof getAllTasks === 'function') return getAllTasks();
    } catch {}
    return Array.isArray(state?.storage?.tasks) ? state.storage.tasks : [];
  }

  function controlSimpleStatus(taskItem) {
    return String(taskItem?.status || 'new').trim().toLowerCase() || 'new';
  }

  function controlSimpleIsActive(taskItem) {
    return CONTROL_SIMPLE_ACTIVE.has(controlSimpleStatus(taskItem));
  }

  function controlSimpleIsDone(taskItem) {
    return controlSimpleStatus(taskItem) === 'done';
  }

  function controlSimpleIsCancelled(taskItem) {
    return controlSimpleStatus(taskItem) === 'cancelled';
  }

  function controlSimpleSku(taskItem) {
    try {
      return typeof getSku === 'function' ? getSku(taskItem?.articleKey) : null;
    } catch {
      return null;
    }
  }

  function marketplaceContextValue(value, depth = 0) {
    if (value == null || depth > 2) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map((item) => marketplaceContextValue(item, depth + 1)).filter(Boolean).join(' ');
    if (typeof value === 'object') {
      return Object.entries(value)
        .filter(([key]) => !/^(history|comments|updates|logs|rawRows?|html|node|element)$/i.test(key))
        .map(([key, item]) => `${key} ${marketplaceContextValue(item, depth + 1)}`)
        .filter(Boolean)
        .join(' ');
    }
    return '';
  }

  function controlSimpleTaskContext(taskItem, sku = null) {
    const taskFields = [
      'platform', 'marketplace', 'marketplaceKey', 'network', 'retailer', 'channel', 'market',
      'contour', 'direction', 'workstream', 'queue', 'role', 'team', 'project', 'topic',
      'title', 'name', 'subject', 'entityLabel', 'description', 'nextAction', 'reason',
      'context', 'comment', 'note', 'notes', 'details', 'message', 'text', 'body',
      'articleKey', 'sku', 'apiSku', 'tags', 'labels', 'meta', 'extra', 'payload', 'fields'
    ];
    const skuFields = [
      'platform', 'marketplace', 'marketplaceKey', 'network', 'retailer', 'channel', 'market',
      'name', 'title', 'articleKey', 'sku', 'apiSku'
    ];
    const taskContext = taskFields.map((key) => marketplaceContextValue(taskItem?.[key])).join(' ');
    const skuContext = skuFields.map((key) => marketplaceContextValue(sku?.[key])).join(' ');
    return [taskContext, skuContext].filter(Boolean).join(' ');
  }

  function controlSimpleDirectionKey(taskItem) {
    const sku = controlSimpleSku(taskItem);
    const context = controlSimpleTaskContext(taskItem, sku);
    try {
      if (typeof controlWorkstreamKey === 'function') {
        const key = controlSimpleNormalizeDirection(controlWorkstreamKey(taskItem, sku));
        if (key !== 'all') return key;
      }
    } catch {}
    const inferred = inferMarketplaceKey(context);
    if (inferred) return inferred;
    const raw = context.toLowerCase();
    if (isGoldAppleSignal(raw)) return 'goldapple';
    if (/\u043b[\s'`\u2019.-]*[\u0435\u044d]\u0442\u0443\u0430\u043b|\u043b\u0435\u0442\u0443\u0430\u043b|letu|letoile|l[\s'`.-]*etoile/.test(raw)) return 'letu';
    if (/\u043c\u0430\u0433\u043d\u0438\u0442|magnit|magnet/.test(raw)) return 'magnit';
    if (raw.includes('ozon') || raw.includes('озон')) return 'ozon';
    if (raw.includes('wb') || raw.includes('wildberries') || raw.includes('вб')) return 'wb';
    if (raw.includes('yandex') || raw.includes('яндекс') || raw.includes('я.маркет')) return 'ya';
    if (raw.includes('gold') || raw.includes('золот')) return 'goldapple';
    if (raw.includes('letu') || raw.includes('лету') || raw.includes("л'")) return 'letu';
    if (raw.includes('magnit') || raw.includes('магнит')) return 'magnit';
    if (raw.includes('launch') || raw.includes('новин') || raw.includes('продукт')) return 'product';
    return taskItem?.articleKey ? 'product' : 'cross';
  }

  function controlSimpleIsOverdue(taskItem) {
    try {
      if (typeof isTaskOverdue === 'function') return Boolean(isTaskOverdue(taskItem));
    } catch {}
    return Boolean(taskItem?.due && controlSimpleIsActive(taskItem) && String(taskItem.due) < todayIso());
  }

  function controlSimpleQueueKey(taskItem) {
    const status = controlSimpleStatus(taskItem);
    if (status === 'done') return 'confirmed';
    if (CONTROL_SIMPLE_SENT.has(status)) return 'sent';
    if (String(taskItem?.source || '').toLowerCase() === 'auto') return 'signals';
    if (!String(taskItem?.articleKey || '').trim() || controlSimpleDirectionKey(taskItem) === 'cross' || taskItem?.type === 'general') return 'common';
    return 'new';
  }

  function controlSimpleUrgency(taskItem) {
    let score = 0;
    if (controlSimpleIsOverdue(taskItem)) score += 80;
    if (taskItem?.priority === 'critical') score += 50;
    if (!taskItem?.owner) score += 25;
    if (CONTROL_SIMPLE_SENT.has(controlSimpleStatus(taskItem))) score += 20;
    if (taskItem?.priority === 'high') score += 12;
    return score;
  }

  function controlSimpleSort(items) {
    return [...(items || [])].sort((a, b) => {
      const score = controlSimpleUrgency(b) - controlSimpleUrgency(a);
      if (score) return score;
      return String(a?.due || '9999-12-31').localeCompare(String(b?.due || '9999-12-31'));
    });
  }

  function controlSimpleFilterState() {
    const filters = state?.controlFilters || {};
    return {
      search: String(filters.search || '').trim().toLowerCase(),
      owner: String(filters.owner || 'all'),
      status: String(filters.status || 'active'),
      priority: String(filters.priority || 'all'),
      type: String(filters.type || 'all'),
      source: String(filters.source || 'all'),
      horizon: String(filters.horizon || 'all')
    };
  }

  function controlSimpleMatchesTaskFilters(taskItem, filters) {
    const status = controlSimpleStatus(taskItem);
    const owner = String(taskItem?.owner || 'Без ответственного');
    if (filters.owner !== 'all' && owner !== filters.owner) return false;
    if (filters.status === 'active' && !controlSimpleIsActive(taskItem)) return false;
    if (filters.status !== 'active' && filters.status !== 'all' && status !== filters.status) return false;
    if (filters.priority !== 'all' && String(taskItem?.priority || 'medium') !== filters.priority) return false;
    if (filters.type !== 'all' && String(taskItem?.type || 'general') !== filters.type) return false;
    if (filters.source === 'manual' && String(taskItem?.source || 'manual').toLowerCase() === 'auto') return false;
    if (filters.source === 'auto' && String(taskItem?.source || 'manual').toLowerCase() !== 'auto') return false;
    if (filters.horizon === 'overdue' && !controlSimpleIsOverdue(taskItem)) return false;
    if (filters.horizon === 'today' && String(taskItem?.due || '') !== todayIso()) return false;
    if (filters.horizon === 'week' && (!taskItem?.due || String(taskItem.due) > plusDays(7))) return false;
    if (filters.horizon === 'no_owner' && String(taskItem?.owner || '').trim()) return false;
    return true;
  }

  function controlSimpleActiveFilterCount(filters) {
    return [
      filters.search ? 'search' : '',
      filters.owner !== 'all' ? 'owner' : '',
      filters.status !== 'active' ? 'status' : '',
      filters.priority !== 'all' ? 'priority' : '',
      filters.type !== 'all' ? 'type' : '',
      filters.source !== 'all' ? 'source' : '',
      filters.horizon !== 'all' ? 'horizon' : ''
    ].filter(Boolean).length;
  }

  function controlSimpleModel() {
    const filters = controlSimpleFilterState();
    const allTasks = controlSimpleAllTasks().filter((taskItem) => !controlSimpleIsCancelled(taskItem));
    const counts = Object.fromEntries(CONTROL_SIMPLE_DIRECTIONS.map(([key]) => [key, 0]));
    counts.all = allTasks.length;
    allTasks.forEach((taskItem) => {
      const key = controlSimpleDirectionKey(taskItem);
      counts[key] = (counts[key] || 0) + 1;
    });
    const selected = controlSimpleSelectedDirection(counts);
    const tasks = allTasks
      .filter((taskItem) => selected === 'all' || controlSimpleDirectionKey(taskItem) === selected)
      .filter((taskItem) => controlSimpleMatchesTaskFilters(taskItem, filters))
      .filter((taskItem) => {
        if (!filters.search) return true;
        return `${taskItem?.title || ''} ${taskItem?.entityLabel || ''} ${taskItem?.articleKey || ''} ${taskItem?.owner || ''} ${taskItem?.nextAction || ''} ${taskItem?.reason || ''}`.toLowerCase().includes(filters.search);
      });
    const buckets = Object.fromEntries(CONTROL_SIMPLE_QUEUES.map(([key]) => [key, []]));
    tasks.forEach((taskItem) => buckets[controlSimpleQueueKey(taskItem)]?.push(taskItem));
    Object.keys(buckets).forEach((key) => { buckets[key] = controlSimpleSort(buckets[key]); });
    const queueFilter = controlSimpleNormalizeQueue(state?.controlFilters?.taskSimpleQueue);
    const displayTasks = queueFilter === 'all' ? tasks : (buckets[queueFilter] || []);
    const active = tasks.filter(controlSimpleIsActive);
    const game = controlSimpleGameModel(tasks, buckets, active);
    return { selected, queueFilter, counts, tasks, displayTasks, buckets, active, game, filters, activeFilterCount: controlSimpleActiveFilterCount(filters), overdue: active.filter(controlSimpleIsOverdue), noOwner: active.filter((taskItem) => !taskItem?.owner) };
  }

  function controlSimpleWorkstreamCounts(tasks) {
    const active = tasks.filter(controlSimpleIsActive);
    return {
      total: tasks.length,
      active: active.length,
      overdue: active.filter(controlSimpleIsOverdue).length,
      noOwner: active.filter((taskItem) => !taskItem?.owner).length,
      sent: active.filter((taskItem) => CONTROL_SIMPLE_SENT.has(controlSimpleStatus(taskItem))).length
    };
  }

  function controlSimpleDueDays(taskItem) {
    const due = String(taskItem?.due || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
    const current = new Date(`${todayIso()}T00:00:00`);
    const target = new Date(`${due}T00:00:00`);
    if (Number.isNaN(current.getTime()) || Number.isNaN(target.getTime())) return null;
    return Math.round((target - current) / 86400000);
  }

  function controlSimpleTaskProgress(taskItem) {
    const status = controlSimpleStatus(taskItem);
    if (status === 'done') return 100;
    if (status === 'waiting_decision') return 78;
    if (status === 'waiting_rop') return 64;
    if (status === 'waiting_team') return 52;
    if (status === 'in_progress') return 42;
    if (String(taskItem?.source || '').toLowerCase() === 'auto') return 18;
    return 22;
  }

  function controlSimpleTaskXp(taskItem) {
    const urgency = controlSimpleUrgency(taskItem);
    const statusBonus = controlSimpleIsDone(taskItem) ? 120 : CONTROL_SIMPLE_SENT.has(controlSimpleStatus(taskItem)) ? 70 : 40;
    const sourceBonus = String(taskItem?.source || '').toLowerCase() === 'auto' ? 18 : 8;
    return Math.max(18, Math.min(180, statusBonus + sourceBonus + Math.round(urgency / 2)));
  }

  function controlSimpleTaskBadges(taskItem, direction) {
    const badges = [];
    const dueDays = controlSimpleDueDays(taskItem);
    if (controlSimpleIsOverdue(taskItem)) badges.push(['просрочено', 'danger']);
    else if (dueDays === 0) badges.push(['сегодня', 'warn']);
    else if (dueDays !== null && dueDays <= 2) badges.push([`${fmt.int(dueDays)} дн.`, 'warn']);
    if (!String(taskItem?.owner || '').trim()) badges.push(['owner', 'warn']);
    if (String(taskItem?.source || '').toLowerCase() === 'auto') badges.push(['авто-сигнал', 'info']);
    if (taskItem?.priority === 'critical') badges.push(['критично', 'danger']);
    else if (taskItem?.priority === 'high') badges.push(['высокий', 'warn']);
    badges.push([direction?.label || 'контур', '']);
    return badges.slice(0, 4);
  }

  function controlSimpleGameModel(tasks, buckets, active) {
    const activeList = active || [];
    const overdue = activeList.filter(controlSimpleIsOverdue);
    const noOwner = activeList.filter((taskItem) => !String(taskItem?.owner || '').trim());
    const sent = activeList.filter((taskItem) => CONTROL_SIMPLE_SENT.has(controlSimpleStatus(taskItem)));
    const critical = activeList.filter((taskItem) => taskItem?.priority === 'critical');
    const signals = (buckets?.signals || []).filter(controlSimpleIsActive);
    const done = (tasks || []).filter(controlSimpleIsDone);
    const ownerCoverage = activeList.length ? Math.round(((activeList.length - noOwner.length) / activeList.length) * 100) : 100;
    const risk = overdue.length * 4 + critical.length * 3 + sent.length * 2 + noOwner.length;
    const score = Math.max(0, Math.min(100, Math.round(100 - (risk / Math.max(1, activeList.length)) * 18)));
    const xp = (tasks || []).reduce((sum, taskItem) => sum + controlSimpleTaskXp(taskItem), 0);
    const focus = overdue.length ? 'просрочка'
      : critical.length ? 'критично'
        : sent.length ? 'ждут ответа'
          : noOwner.length ? 'назначить owner'
            : signals.length ? 'авто-сигналы'
              : 'контур ровный';
    return {
      score,
      xp,
      focus,
      ownerCoverage,
      overdue: overdue.length,
      noOwner: noOwner.length,
      sent: sent.length,
      signals: signals.length,
      done: done.length,
      level: score >= 86 ? 'контур чистый' : score >= 68 ? 'рабочий фокус' : 'разобрать риски'
    };
  }

  function controlSimpleGameHero(data) {
    const game = data.game || {};
    const selectedMeta = CONTROL_SIMPLE_META[data.selected] || CONTROL_SIMPLE_META.cross;
    const tone = game.score >= 86 ? 'ok' : game.score >= 68 ? 'warn' : 'danger';
    return `
      <section class="control-simple-game" data-platform="${escapeHtml(data.selected || 'all')}">
        <div class="control-simple-game-main">
          <span>Уровень задач</span>
          <strong>${fmt.int(game.score || 0)}</strong>
          <em>${escapeHtml(game.level || 'рабочий фокус')} · ${escapeHtml(selectedMeta.label || 'контур')}</em>
          <div class="control-simple-game-meter"><i style="width:${Math.max(0, Math.min(100, game.score || 0))}%"></i></div>
        </div>
        <div class="control-simple-game-grid">
          <div class="control-simple-game-cell is-xp"><span>XP команды</span><strong>${fmt.int(game.xp || 0)}</strong><em>за активность и закрытия</em></div>
          <div class="control-simple-game-cell ${game.overdue ? 'is-danger' : 'is-ok'}"><span>Срочно</span><strong>${fmt.int(game.overdue || 0)}</strong><em>просрочено</em></div>
          <div class="control-simple-game-cell ${game.ownerCoverage < 90 ? 'is-warn' : 'is-ok'}"><span>Owner</span><strong>${fmt.int(game.ownerCoverage || 0)}%</strong><em>покрытие задач</em></div>
          <div class="control-simple-game-cell ${tone ? `is-${tone}` : ''}"><span>Фокус</span><strong>${escapeHtml(game.focus || 'контур')}</strong><em>${fmt.int(game.signals || 0)} авто · ${fmt.int(game.sent || 0)} ждут</em></div>
        </div>
      </section>`;
  }

  function controlSimpleWorkstreamPanel(key, tasks) {
    const meta = CONTROL_SIMPLE_META[key] || CONTROL_SIMPLE_META.cross;
    const expanded = state?.controlFilters?.taskSimpleExpandedPlatform === key;
    const sorted = controlSimpleSort(tasks || []);
    const visible = sorted.slice(0, expanded ? 999 : 6);
    const hidden = Math.max(0, sorted.length - visible.length);
    const counts = controlSimpleWorkstreamCounts(sorted);
    const tone = counts.overdue ? 'danger' : counts.sent || counts.noOwner ? 'warn' : counts.active ? 'info' : 'ok';
    return `
      <section class="control-simple-workstream-lane ${counts.active ? '' : 'is-empty'}" data-platform="${escapeHtml(key)}" data-control-simple-workstream-lane="${escapeHtml(key)}">
        <div class="control-simple-workstream-lane-head">
          <div>
            <span>${escapeHtml(meta.hint)}</span>
            <strong>${escapeHtml(meta.label)}</strong>
          </div>
          <div class="badge-stack">
            ${badge(`${fmt.int(counts.active)} активных`, tone)}
            ${counts.overdue ? badge(`${fmt.int(counts.overdue)} проср.`, 'danger') : ''}
            ${counts.noOwner ? badge(`${fmt.int(counts.noOwner)} без owner`, 'warn') : ''}
          </div>
        </div>
        <div class="control-simple-workstream-note">
          ${counts.active
            ? `Показываем только задачи этого контура. Остальные площадки не смешиваются с ${meta.label}.`
            : 'В этом контуре сейчас нет активных задач.'}
        </div>
        <div class="control-simple-list">
          ${visible.length ? visible.map(controlSimpleTaskCard).join('') : '<div class="control-simple-empty">Пусто. Здесь не горит.</div>'}
          ${hidden ? `<button class="control-simple-more" type="button" data-control-simple-expand-platform="${escapeHtml(key)}">Ещё ${fmt.int(hidden)} в ${escapeHtml(meta.label)}</button>` : ''}
        </div>
        <button class="btn ghost small-btn" type="button" data-control-simple-direction="${escapeHtml(key)}">Открыть ${escapeHtml(meta.label)}</button>
      </section>`;
  }

  function controlSimpleWorkstreamBoard(data) {
    const boardTasks = data.displayTasks || data.tasks || [];
    const lanes = CONTROL_SIMPLE_WORKSPACE_ORDER
      .map((key) => ({
        key,
        tasks: boardTasks.filter((taskItem) => controlSimpleDirectionKey(taskItem) === key)
      }))
      .filter((lane) => lane.tasks.length || (data.queueFilter === 'all' && Number(data.counts?.[lane.key] || 0) > 0));
    return `
      <div class="control-simple-platform-board">
        <div class="control-simple-platform-board-head">
          <div>
            <span>Площадки</span>
            <strong>Каждая площадка отдельно</strong>
          </div>
          ${badge(`${fmt.int(boardTasks.length)} задач`, boardTasks.length ? 'info' : 'ok')}
        </div>
        <div class="control-simple-platform-lanes">
          ${lanes.length ? lanes.map((lane) => controlSimpleWorkstreamPanel(lane.key, lane.tasks)).join('') : '<div class="control-simple-empty">По текущему фильтру задач нет.</div>'}
        </div>
      </div>`;
  }

  function controlSimpleTaskId(taskItem) {
    return String(taskItem?.id || taskItem?.articleKey || '').trim();
  }

  function controlSimpleStatusText(taskItem) {
    const status = controlSimpleStatus(taskItem);
    if (status === 'new') return 'новая';
    if (status === 'in_progress') return 'в работе';
    if (status === 'waiting_team') return 'ждёт отдел';
    if (status === 'waiting_rop') return 'у РОПа';
    if (status === 'waiting_decision') return 'на финале';
    if (status === 'done') return 'закрыта';
    return status;
  }

  function controlSimplePriorityText(taskItem) {
    if (taskItem?.priority === 'critical') return 'критично';
    if (taskItem?.priority === 'high') return 'высокий';
    if (taskItem?.priority === 'low') return 'низкий';
    return 'средний';
  }

  function controlSimpleAction(taskItem) {
    const id = controlSimpleTaskId(taskItem);
    if (!id || controlSimpleIsDone(taskItem)) return '';
    const status = controlSimpleStatus(taskItem);
    if (String(taskItem?.source || '').toLowerCase() === 'auto') return `<button class="btn small-btn primary" type="button" data-control-simple-action="take" data-task-id="${escapeHtml(id)}">Взять</button>`;
    if (status === 'new') return `<button class="btn small-btn primary" type="button" data-control-simple-action="start" data-task-id="${escapeHtml(id)}">В работу</button>`;
    if (status === 'in_progress') return `<button class="btn small-btn ghost" type="button" data-control-simple-action="send" data-task-id="${escapeHtml(id)}">К РОПу</button>`;
    if (status === 'waiting_rop') return `<button class="btn small-btn ghost" type="button" data-control-simple-action="approve" data-task-id="${escapeHtml(id)}">К финалу</button>`;
    if (status === 'waiting_decision') return `<button class="btn small-btn ghost" type="button" data-control-simple-action="confirm" data-task-id="${escapeHtml(id)}">Подтвердить</button>`;
    return '';
  }

  function controlSimpleTaskCard(taskItem) {
    const id = controlSimpleTaskId(taskItem);
    const next = String(taskItem?.nextAction || taskItem?.reason || '').trim();
    const tone = controlSimpleIsOverdue(taskItem) || taskItem?.priority === 'critical' ? 'danger' : CONTROL_SIMPLE_SENT.has(controlSimpleStatus(taskItem)) ? 'warn' : controlSimpleIsDone(taskItem) ? 'ok' : '';
    const directionKey = controlSimpleDirectionKey(taskItem);
    const direction = CONTROL_SIMPLE_META[directionKey] || CONTROL_SIMPLE_META.cross;
    const productStatus = taskProductStatusLabel(taskItem);
    const progress = controlSimpleTaskProgress(taskItem);
    const xp = controlSimpleTaskXp(taskItem);
    const taskBadges = controlSimpleTaskBadges(taskItem, direction);
    return `
      <div class="control-simple-task ${tone ? `is-${tone}` : ''}" data-platform="${escapeHtml(directionKey)}">
        <button class="control-simple-task-main" type="button" data-control-simple-open-task="${escapeHtml(id)}">
          <div class="control-simple-task-rank"><span>XP ${fmt.int(xp)}</span><b>${fmt.int(progress)}%</b></div>
          <strong>${escapeHtml(taskItem?.title || taskItem?.entityLabel || taskItem?.articleKey || 'Задача')}</strong>
          <span>${escapeHtml(taskPeopleLine(taskItem))} · срок ${escapeHtml(taskItem?.due || 'без срока')} · пост. ${escapeHtml(taskCreatedLabel(taskItem, true))}</span>
          ${next ? `<em>${escapeHtml(next.slice(0, 112))}${next.length > 112 ? '...' : ''}</em>` : ''}
          <div class="control-simple-task-badges">
            ${taskBadges.map(([label, badgeTone]) => `<i class="${badgeTone ? `is-${escapeHtml(badgeTone)}` : ''}">${escapeHtml(label)}</i>`).join('')}
          </div>
          <div class="control-simple-task-meter"><i style="width:${Math.max(0, Math.min(100, progress))}%"></i></div>
        </button>
        <div class="control-simple-task-foot">
          <span>${escapeHtml(direction.label)}</span>
          ${productStatus ? `<span>${escapeHtml(productStatus)}</span>` : ''}
          <span>${escapeHtml(controlSimpleStatusText(taskItem))}</span>
          <span>${escapeHtml(controlSimplePriorityText(taskItem))}</span>
          <span class="control-simple-actions"><button class="btn small-btn ghost" type="button" data-control-simple-open-task="${escapeHtml(id)}">Открыть</button>${controlSimpleAction(taskItem)}</span>
        </div>
      </div>`;
  }

  function controlSimpleQueuePanel(key, title, hint, tasks, focused = false) {
    const visible = tasks;
    const tone = controlSimpleQueueTone(key);
    return `
      <section class="control-simple-queue ${focused ? 'is-focused' : ''}" data-control-simple-queue="${escapeHtml(key)}">
        <div class="control-simple-queue-head"><div><span>${escapeHtml(hint)}</span><strong>${escapeHtml(title)}</strong></div>${badge(fmt.int(tasks.length), tone)}</div>
        <div class="control-simple-list">
          ${visible.length ? visible.map(controlSimpleTaskCard).join('') : '<div class="control-simple-empty">Пусто. Здесь не горит.</div>'}
        </div>
      </section>`;
  }

  function controlSimpleStatusOptions(selected) {
    const statusMeta = typeof TASK_STATUS_META === 'object' && TASK_STATUS_META ? TASK_STATUS_META : {};
    const options = [
      ['active', 'Активные'],
      ['all', 'Все статусы'],
      ...Object.entries(statusMeta).map(([value, meta]) => [value, meta?.label || value])
    ];
    const seen = new Set();
    return options
      .filter(([value]) => {
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
      })
      .map(([value, label]) => `<option value="${escapeHtml(value)}" ${selected === value ? 'selected' : ''}>${escapeHtml(label)}</option>`)
      .join('');
  }

  function controlSimpleFilterControls(data) {
    const filters = data?.filters || controlSimpleFilterState();
    const ownerList = owners();
    const priorityMeta = typeof PRIORITY_META === 'object' && PRIORITY_META ? PRIORITY_META : {};
    const typeMeta = typeof TASK_TYPE_META === 'object' && TASK_TYPE_META ? TASK_TYPE_META : {};
    return `
      <div class="control-simple-filters" data-control-simple-filters>
        <label>
          <span>Owner</span>
          <select data-control-simple-filter="owner">
            <option value="all" ${filters.owner === 'all' ? 'selected' : ''}>Все ответственные</option>
            <option value="Без ответственного" ${filters.owner === 'Без ответственного' ? 'selected' : ''}>Без owner</option>
            ${ownerList.map((owner) => `<option value="${escapeHtml(owner)}" ${filters.owner === owner ? 'selected' : ''}>${escapeHtml(owner)}</option>`).join('')}
          </select>
        </label>
        <label>
          <span>Статус</span>
          <select data-control-simple-filter="status">${controlSimpleStatusOptions(filters.status)}</select>
        </label>
        <label>
          <span>Приоритет</span>
          <select data-control-simple-filter="priority">
            <option value="all" ${filters.priority === 'all' ? 'selected' : ''}>Все приоритеты</option>
            ${Object.entries(priorityMeta).map(([value, meta]) => `<option value="${escapeHtml(value)}" ${filters.priority === value ? 'selected' : ''}>${escapeHtml(meta?.label || value)}</option>`).join('')}
          </select>
        </label>
        <label>
          <span>Тип</span>
          <select data-control-simple-filter="type">
            <option value="all" ${filters.type === 'all' ? 'selected' : ''}>Все типы</option>
            ${Object.entries(typeMeta).map(([value, label]) => `<option value="${escapeHtml(value)}" ${filters.type === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
          </select>
        </label>
        <label>
          <span>Горизонт</span>
          <select data-control-simple-filter="horizon">
            <option value="all" ${filters.horizon === 'all' ? 'selected' : ''}>Весь горизонт</option>
            <option value="overdue" ${filters.horizon === 'overdue' ? 'selected' : ''}>Просрочено</option>
            <option value="today" ${filters.horizon === 'today' ? 'selected' : ''}>Сегодня</option>
            <option value="week" ${filters.horizon === 'week' ? 'selected' : ''}>7 дней</option>
            <option value="no_owner" ${filters.horizon === 'no_owner' ? 'selected' : ''}>Без owner</option>
          </select>
        </label>
        <label>
          <span>Источник</span>
          <select data-control-simple-filter="source">
            <option value="all" ${filters.source === 'all' ? 'selected' : ''}>Все источники</option>
            <option value="manual" ${filters.source === 'manual' ? 'selected' : ''}>Ручные</option>
            <option value="auto" ${filters.source === 'auto' ? 'selected' : ''}>Авто-сигналы</option>
          </select>
        </label>
        <button class="btn ghost small-btn" type="button" data-control-simple-filter-reset>Сбросить</button>
      </div>`;
  }

  function controlSimpleQueueTabs(data) {
    const tabs = [
      ['all', 'Все', 'Без фильтра', data.tasks.length],
      ...CONTROL_SIMPLE_QUEUES.map(([key, title, hint]) => [key, title.replace(/\s+задачи$/i, ''), hint, (data.buckets[key] || []).length])
    ];
    return `
      <div class="control-simple-filterbar">
        <div class="control-simple-filterbar-head">
          <strong>Фильтр задач</strong>
          <span>${data.selected === 'all' ? 'по всем площадкам' : `по площадке ${(CONTROL_SIMPLE_META[data.selected] || CONTROL_SIMPLE_META.cross).label}`}</span>
        </div>
        <div class="control-simple-queue-tabs">
          ${tabs.map(([key, title, hint, count]) => `
            <button class="control-simple-queue-tab ${data.queueFilter === key ? 'active' : ''}" type="button" data-control-simple-queue-filter="${escapeHtml(key)}" aria-pressed="${data.queueFilter === key ? 'true' : 'false'}">
              <span>${escapeHtml(title)}</span>
              <b>${fmt.int(count)}</b>
              <em>${escapeHtml(hint)}</em>
            </button>
          `).join('')}
        </div>
      </div>`;
  }

  function controlSimpleCreateForm(selected) {
    if (!state?.controlFilters?.taskSimpleCreateOpen) return '';
    const direction = selected && selected !== 'all' && CONTROL_SIMPLE_META[selected] ? selected : 'cross';
    return `
      <section class="control-simple-create">
        <div class="control-simple-create-head">
          <div><strong>Поставить задачу</strong><span>что сделать, кому, срок</span></div>
          <button class="btn ghost small-btn" type="button" data-control-simple-create-close>Скрыть</button>
        </div>
        <form id="controlSimpleCreateForm" class="control-simple-form">
          <input name="title" placeholder="Что нужно сделать" required>
          <select name="platform">${CONTROL_SIMPLE_DIRECTIONS.filter(([key]) => key !== 'all').map(([key, label]) => `<option value="${escapeHtml(key)}" ${direction === key ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>
          <input name="owner" list="controlSimpleOwnerList" placeholder="Кто делает">
          <input name="coOwner" list="controlSimpleOwnerList" placeholder="Соисполнитель">
          <input name="due" type="date" value="${plusDays(2)}">
          <select name="type"><option value="general">Общее</option><option value="price_margin">Цена / маржа</option><option value="traffic">Трафик</option><option value="content">Контент</option><option value="supply">Остатки</option><option value="launch">Новинка</option><option value="assignment">Назначение owner</option></select>
          <select name="priority"><option value="high">Высокий</option><option value="medium">Средний</option><option value="critical">Критично</option><option value="low">Низкий</option></select>
          <input name="entityLabel" placeholder="SKU / тема / проект">
          <textarea name="nextAction" rows="3" placeholder="Первый шаг или критерий готовности"></textarea>
          <button class="btn primary" type="submit">Создать</button>
        </form>
        <datalist id="controlSimpleOwnerList">${owners().map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
      </section>`;
  }

  function controlSimpleDirectionButton(key, data) {
    const meta = CONTROL_SIMPLE_META[key] || CONTROL_SIMPLE_META.cross;
    const count = Number(data?.counts?.[key] || 0);
    const active = data?.selected === key;
    const manager = key === 'all';
    return `<button class="control-simple-direction ${active ? 'active' : ''} ${manager ? 'is-manager' : ''}" type="button" data-platform="${escapeHtml(key)}" data-control-simple-direction="${escapeHtml(key)}"><strong>${escapeHtml(meta.label)}</strong><span>${escapeHtml(manager ? 'обзор по всем' : meta.hint)}</span><b>${fmt.int(count)}</b></button>`;
  }

  function controlSimpleWorkspacePanel(data) {
    const selectedMeta = CONTROL_SIMPLE_META[data.selected] || CONTROL_SIMPLE_META.cross;
    const selectedText = data.selected === 'all'
      ? 'Все площадки ниже разделены на отдельные колонки. Ничего не смешивается в одну очередь.'
      : `Открыта площадка ${selectedMeta.label}. Остальные задачи скрыты, чтобы не мешали работе.`;
    return `
      <div class="control-simple-workspace">
        <div class="control-simple-workspace-head">
          <div>
            <span>Контуры задач</span>
            <strong>Сначала выберите площадку</strong>
            <em>${escapeHtml(selectedText)}</em>
          </div>
        </div>
        <div class="control-simple-directions">${CONTROL_SIMPLE_DIRECTION_RENDER_ORDER.map((key) => controlSimpleDirectionButton(key, data)).join('')}</div>
      </div>`;
  }

  async function controlSimpleRunAction(action, id) {
    if (!id) return;
    if (action === 'take' && typeof takeAutoTask === 'function') await takeAutoTask(id);
    else if (action === 'start' && typeof updateTaskStatus === 'function') await updateTaskStatus(id, 'in_progress');
    else if (action === 'send' && typeof submitTaskForRopApproval === 'function') await submitTaskForRopApproval(id, 'Передано из простого экрана задач.');
    else if (action === 'send' && typeof updateTaskStatus === 'function') await updateTaskStatus(id, 'waiting_rop');
    else if (action === 'approve' && typeof approveTaskByRop === 'function') await approveTaskByRop(id, 'Согласовано из простого экрана задач.');
    else if (action === 'approve' && typeof updateTaskStatus === 'function') await updateTaskStatus(id, 'waiting_decision');
    else if (action === 'confirm' && typeof finalCloseTaskWithReport === 'function') await finalCloseTaskWithReport(id, 'Подтверждено из простого экрана задач.');
    else if (action === 'confirm' && typeof updateTaskStatus === 'function') await updateTaskStatus(id, 'done');
    controlRefined();
  }

  function controlSimpleRender(root) {
    if (!root) return;
    state.controlFilters = state.controlFilters || {};
    if (state.controlFilters.taskSimpleFullMode) {
      if (baseControl) baseControl();
      root.querySelector('#controlSourceFilter')?.remove();
      root.insertAdjacentHTML('afterbegin', `<div class="control-simple-return"><button class="btn primary" type="button" data-control-simple-return>Вернуться к рабочему виду</button>${badge('все поля', 'warn')}</div>`);
      root.querySelector('[data-control-simple-return]')?.addEventListener('click', () => {
        state.controlFilters.taskSimpleFullMode = false;
        controlRefined();
      });
      return;
    }

    const data = controlSimpleModel();
    const boardHtml = data.selected === 'all'
      ? controlSimpleWorkstreamBoard(data)
      : `<div class="control-simple-board ${data.queueFilter !== 'all' ? 'is-focused' : ''}">${CONTROL_SIMPLE_QUEUES
        .filter(([key]) => data.queueFilter === 'all' || data.queueFilter === key)
        .map(([key, title, hint]) => controlSimpleQueuePanel(key, title, hint, data.buckets[key] || [], data.queueFilter === key))
        .join('')}</div>`;
    root.dataset.controlSimple = '20260529taskfilters1';
    root.innerHTML = `
      <div class="section-title control-simple-title">
        <div><h2>Задачи</h2><div class="control-simple-title-copy">${escapeHtml(CONTROL_SIMPLE_TITLE)}</div></div>
        <div class="badge-stack">${badge(`${fmt.int(data.active.length)} активных`, data.active.length ? 'info' : 'ok')}${badge(`${fmt.int(data.overdue.length)} просрочено`, data.overdue.length ? 'danger' : 'ok')}${badge(`${fmt.int(data.noOwner.length)} без owner`, data.noOwner.length ? 'warn' : 'ok')}</div>
      </div>
      <div class="control-simple-panel">
        ${controlSimpleGameHero(data)}
        ${controlSimpleWorkspacePanel(data)}
        <div class="control-simple-topbar">
          <input id="controlSimpleSearch" value="${escapeHtml(state.controlFilters.search || '')}" placeholder="Поиск по задаче, SKU, owner">
          <div class="badge-stack">
            ${data.activeFilterCount ? badge(`фильтров ${fmt.int(data.activeFilterCount)}`, 'warn') : badge('фильтры чистые', 'ok')}
            <button class="btn primary" type="button" data-control-simple-create-toggle>${state.controlFilters.taskSimpleCreateOpen ? 'Закрыть форму' : 'Поставить задачу'}</button>
            <button class="btn ghost" type="button" data-control-simple-full>Все поля</button>
          </div>
        </div>
        ${controlSimpleFilterControls(data)}
        ${controlSimpleQueueTabs(data)}
        ${controlSimpleCreateForm(data.selected)}
        ${boardHtml}
      </div>`;

    root.querySelector('#controlSimpleSearch')?.addEventListener('input', (event) => {
      state.controlFilters.search = event.target.value;
      state.controlFilters.taskSimpleQueue = 'all';
      controlRefined();
    });
    root.querySelectorAll('[data-control-simple-filter]').forEach((control) => control.addEventListener('change', (event) => {
      const key = control.dataset.controlSimpleFilter;
      if (!key) return;
      state.controlFilters[key] = event.target.value;
      state.controlFilters.taskSimpleQueue = 'all';
      state.controlFilters.taskSimpleExpandedPlatform = '';
      controlRefined();
    }));
    root.querySelector('[data-control-simple-filter-reset]')?.addEventListener('click', () => {
      state.controlFilters.search = '';
      state.controlFilters.owner = 'all';
      state.controlFilters.status = 'active';
      state.controlFilters.priority = 'all';
      state.controlFilters.type = 'all';
      state.controlFilters.source = 'all';
      state.controlFilters.horizon = 'all';
      state.controlFilters.taskSimpleQueue = 'all';
      state.controlFilters.taskSimpleExpandedPlatform = '';
      controlRefined();
    });
    root.querySelectorAll('[data-control-simple-direction]').forEach((button) => button.addEventListener('click', () => {
      const key = controlSimpleNormalizeDirection(button.dataset.controlSimpleDirection);
      state.controlFilters.platform = key;
      state.controlFilters.peopleRole = key === 'all' || key === 'cross' ? 'leader' : key;
      state.controlFilters.taskSimpleWorkspaceChosen = true;
      state.controlFilters.taskSimpleExpandedPlatform = '';
      state.controlFilters.taskSimpleQueue = 'all';
      state.controlFilters.status = 'active';
      state.controlFilters.horizon = 'all';
      state.controlFilters.source = 'all';
      controlRefined();
    }));
    root.querySelector('[data-control-simple-create-toggle]')?.addEventListener('click', () => {
      state.controlFilters.taskSimpleCreateOpen = !state.controlFilters.taskSimpleCreateOpen;
      controlRefined();
    });
    root.querySelector('[data-control-simple-create-close]')?.addEventListener('click', () => {
      state.controlFilters.taskSimpleCreateOpen = false;
      controlRefined();
    });
    root.querySelector('[data-control-simple-full]')?.addEventListener('click', () => {
      state.controlFilters.taskSimpleFullMode = true;
      controlRefined();
    });
    root.querySelectorAll('[data-control-simple-queue-filter]').forEach((button) => button.addEventListener('click', () => {
      state.controlFilters.taskSimpleQueue = controlSimpleNormalizeQueue(button.dataset.controlSimpleQueueFilter);
      state.controlFilters.taskSimpleExpandedPlatform = '';
      controlRefined();
    }));
    root.querySelectorAll('[data-control-simple-expand-platform]').forEach((button) => button.addEventListener('click', () => {
      state.controlFilters.taskSimpleExpandedPlatform = button.dataset.controlSimpleExpandPlatform || '';
      controlRefined();
    }));
    root.querySelectorAll('[data-control-simple-open-task]').forEach((button) => button.addEventListener('click', () => {
      const id = button.dataset.controlSimpleOpenTask;
      if (id && typeof renderTaskModal === 'function') renderTaskModal(id);
    }));
    root.querySelectorAll('[data-control-simple-action]').forEach((button) => button.addEventListener('click', async () => {
      if (button.dataset.sending === '1') return;
      const initialText = button.textContent || '';
      button.dataset.sending = '1';
      button.disabled = true;
      try {
        await controlSimpleRunAction(button.dataset.controlSimpleAction, button.dataset.taskId);
      } finally {
        button.dataset.sending = '0';
        if (button.isConnected) {
          button.disabled = false;
          button.textContent = initialText;
        }
      }
    }));
    root.querySelector('#controlSimpleCreateForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const created = await createManualTask({
        articleKey: '',
        entityLabel: form.get('entityLabel'),
        title: form.get('title'),
        type: form.get('type') || 'general',
        priority: form.get('priority') || 'high',
        platform: form.get('platform') || data.selected || 'cross',
        owner: form.get('owner'),
        coOwner: form.get('coOwner'),
        due: form.get('due'),
        nextAction: form.get('nextAction'),
        reason: 'Создано из простого экрана задач'
      });
      state.controlFilters.taskSimpleCreateOpen = false;
      controlRefined();
      if (created?.id && typeof renderTaskModal === 'function') renderTaskModal(created.id);
    });
  }

  function executiveTaskQueue(items, emptyText, limit = EXEC_QUEUE_LIMIT) {
    const shown = items.slice(0, limit);
    const rest = Math.max(0, items.length - shown.length);
    if (!shown.length) return `<div class="empty">${escapeHtml(emptyText)}</div>`;
    return `${shown.map(renderMiniTask).join('')}${rest ? `<div class="empty compact">Ещё ${fmt.int(rest)} — откройте площадку или задачи</div>` : ''}`;
  }

  function bindExecutiveActions(root) {
    root.querySelectorAll('[data-executive-open-workstream]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = normPlatform(button.dataset.executiveOpenWorkstream || 'cross');
        state.controlFilters = state.controlFilters || {};
        state.controlFilters.platform = key;
        state.controlFilters.peopleRole = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'product'].includes(key) ? key : 'leader';
        state.controlFilters.status = 'active';
        state.controlFilters.horizon = 'all';
        state.controlFilters.source = 'all';
        state.controlFilters.lazyQueue = 'now';
        if (typeof setView === 'function') setView('control');
      });
    });
  }

  function executiveRefined() {
    const root = document.getElementById('view-executive');
    if (!root) return;
    if (window.__ALTEA_EXECUTIVE_LITE_GUARD_READY__ || root.dataset.executiveLayer || root.querySelector('[data-executive-lite-panel]')) return;
    if (typeof getControlSnapshot !== 'function') {
      if (baseExecutive) baseExecutive();
      return;
    }
    const control = getControlSnapshot();
    const active = typeof sortTasks === 'function' ? sortTasks(control.active || []) : (control.active || []);
    const waiting = active.filter((item) => item.status === 'waiting_decision');
    const waitingRop = active.filter((item) => item.status === 'waiting_rop');
    const critical = active.filter((item) => item.priority === 'critical');
    const overdue = active.filter((item) => typeof isTaskOverdue === 'function' ? isTaskOverdue(item) : false);
    const noOwner = active.filter((item) => !item.owner);
    const escalations = active.filter((item) => item.status === 'waiting_decision' || item.status === 'waiting_rop' || item.priority === 'critical' || !item.owner || (typeof isTaskOverdue === 'function' ? isTaskOverdue(item) : false)).slice(0, 12);
    const launches = typeof getLaunchItems === 'function' ? getLaunchItems().slice(0, 4) : [];
    const unassigned = (state.skus || []).filter((sku) => !sku?.flags?.assigned).slice(0, 6);
    const platformRows = executivePlatformRows(active);
    const visiblePlatforms = platformRows;
    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Руководителю</h2>
          <p>Сначала площадки и красные зоны, потом конкретные задачи. Каждый РОП открывает только свой контур.</p>
        </div>
        <div class="badge-stack">${badge(`${fmt.int(waiting.length)} ждут финала`, waiting.length ? 'warn' : 'ok')}${badge(`${fmt.int(waitingRop.length)} у РОПа`, waitingRop.length ? 'info' : 'ok')}</div>
      </div>
      <div class="kpi-strip">
        <div class="mini-kpi warn"><span>Финальное согласование</span><strong>${fmt.int(waiting.length)}</strong><span>готовы к закрытию</span></div>
        <div class="mini-kpi"><span>Согласование у РОПа</span><strong>${fmt.int(waitingRop.length)}</strong><span>ещё не дошли до финала</span></div>
        <div class="mini-kpi danger"><span>Просрочено</span><strong>${fmt.int(overdue.length)}</strong><span>нужен апдейт срока</span></div>
        <div class="mini-kpi"><span>Активно в контуре</span><strong>${fmt.int(active.length)}</strong><span>все задачи сейчас</span></div>
      </div>

      <div class="card executive-platform-panel" data-executive-platform-panel>
        <div class="section-subhead">
          <div>
            <h3>Площадки</h3>
            <p class="small muted">WB, Ozon и остальные контуры разделены. Кнопка сразу открывает задачи нужной площадки.</p>
          </div>
          ${badge(`${fmt.int(visiblePlatforms.reduce((sum, row) => sum + row.items.length, 0))} активных`, visiblePlatforms.length ? 'info' : 'ok')}
        </div>
        <div class="executive-platform-grid">${visiblePlatforms.map(executivePlatformCard).join('')}</div>
      </div>

      <div class="two-col" style="margin-top:14px">
        <div class="card"><div class="section-subhead"><div><h3>Что решить сегодня</h3><p class="small muted">Только критичное, просрочки и согласования. Остальное не шумит.</p></div>${badge(`${fmt.int(escalations.length)} в фокусе`, escalations.length ? 'danger' : 'ok')}</div><div class="task-mini-grid">${executiveTaskQueue(escalations, 'Срочных решений нет')}</div></div>
        <div class="card"><div class="section-subhead"><div><h3>У РОПов</h3><p class="small muted">Задачи, которые ещё ждут решения площадки.</p></div>${badge(`${fmt.int(waitingRop.length)} шт.`, waitingRop.length ? 'info' : 'ok')}</div><div class="task-mini-grid">${executiveTaskQueue(waitingRop, 'У РОПа нет задач на согласовании')}</div></div>
      </div>

      <details class="card executive-details">
        <summary><span>Подробности</span><small>owner, финал, SKU без владельца</small></summary>
        <div class="two-col executive-detail-grid">
          <div><div class="section-subhead"><div><h3>Финальный блок</h3><p class="small muted">То, что уже прошло РОПа.</p></div>${badge(`${fmt.int(waiting.length)} шт.`, waiting.length ? 'warn' : 'ok')}</div><div class="task-mini-grid">${executiveTaskQueue(waiting, 'Нет задач на финальном согласовании')}</div></div>
          <div><div class="section-subhead"><div><h3>Нагрузка по owner</h3><p class="small muted">Кому сейчас тяжелее всего.</p></div>${badge(`${fmt.int((control.byOwner || []).length)} owner`, (control.byOwner || []).length ? 'info' : 'ok')}</div><div class="owner-summary">${ownerRows((control.byOwner || []).slice(0, 5)) || '<div class="empty">Появится после закрепления задач за owner</div>'}</div></div>
        </div>
        <div class="two-col executive-detail-grid">
          <div><div class="section-subhead"><div><h3>Где не хватает owner</h3><p class="small muted">Задачи без ответственного отдельно.</p></div>${badge(`${fmt.int(noOwner.length)} без owner`, noOwner.length ? 'warn' : 'ok')}</div><div class="task-mini-grid">${executiveTaskQueue(noOwner, 'Все активные задачи уже закреплены')}</div></div>
          <div><div class="section-subhead"><div><h3>Новинки и SKU</h3><p class="small muted">Запуски и SKU без владельца.</p></div>${badge(`${fmt.int(launches.length + unassigned.length)} сигналов`, (launches.length + unassigned.length) ? 'info' : 'ok')}</div><div class="alert-stack">${launches.map((item) => `<div class="alert-row"><div><strong>${escapeHtml(item.name || 'Новинка')}</strong><div class="muted small">${escapeHtml(item.launchMonth || '—')} · ${escapeHtml(item.reportGroup || '—')}</div></div><div class="badge-stack">${badge(item.tag || 'новинка', 'info')}${item.production ? badge(item.production) : ''}</div><div class="muted small">${escapeHtml(item.status || 'Статус не указан')}</div></div>`).join('')}${unassigned.map((sku) => `<div class="alert-row"><div><strong>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</strong><div class="muted small">${escapeHtml(sku.name || 'Без названия')}</div></div><div class="badge-stack">${badge('Без owner', 'warn')}${typeof skuOperationalStatus === 'function' ? skuOperationalStatus(sku) : ''}</div><div class="muted small">${escapeHtml(sku.focusReasons || 'Нужно закрепить owner и сценарий работы')}</div></div>`).join('') || '<div class="empty">Нет запусков и SKU без owner в текущем фокусе</div>'}</div></div>
        </div>
      </details>`;
    bindExecutiveActions(root);
  }

  function controlRefined() {
    controlSimpleRender(document.getElementById('view-control'));
  }

  window.renderTaskModal = taskModalRefined;
  window.openTaskModal = taskModalRefined;
  window.renderControlCenter = controlRefined;
  window.renderExecutive = executiveRefined;
  try { renderTaskModal = taskModalRefined; } catch {}
  try { openTaskModal = taskModalRefined; } catch {}
  try { renderControlCenter = controlRefined; } catch {}
  try { renderExecutive = executiveRefined; } catch {}

  if (state?.activeView === 'control') controlRefined();
  if (state?.activeView === 'executive') executiveRefined();
  if (state?.activeTaskId) taskModalRefined(state.activeTaskId);
  applyTaskDeepLink();
  window.addEventListener('altea:viewchange', () => applyTaskDeepLink());
})();
