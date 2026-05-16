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
    product: { label: 'Продукт / новинки', chip: 'Продукт', kind: 'info' },
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

  const meta = (k) => WS[k] || WS.cross;
  const task = (id) => typeof getTask === 'function' ? getTask(id) : null;
  const history = (id) => typeof getTaskHistory === 'function' ? getTaskHistory(id) : [];
  const owners = () => typeof ownerOptions === 'function' ? ownerOptions() : [];
  const normPlatform = (v) => {
    const raw = String(v || '').trim().toLowerCase();
    if (raw === 'retail') return 'ya';
    return ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'product', 'cross'].includes(raw) ? raw : 'cross';
  };
  const stage = (s) => s === 'waiting_decision' ? 3 : s === 'waiting_rop' ? 2 : 1;

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
            <div class="ui-grid-2">
              <label class="ui-field"><span class="ui-label">Owner</span><input name="owner" list="taskOwnerList" value="${escapeHtml(taskItem.owner || '')}" placeholder="Кто ведёт"></label>
              <label class="ui-field"><span class="ui-label">Срок</span><input name="due" type="date" value="${escapeHtml(taskItem.due || '')}"></label>
            </div>
            <div class="task-due-modal-quick">
              <span>Быстрый срок</span>
              <button class="btn ghost small-btn" type="button" data-task-modal-due="0">Сегодня</button>
              <button class="btn ghost small-btn" type="button" data-task-modal-due="1">+1 день</button>
              <button class="btn ghost small-btn" type="button" data-task-modal-due="3">+3 дня</button>
              <button class="btn ghost small-btn" type="button" data-task-modal-due="7">+7 дней</button>
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
              <option value="product" ${currentPlatform === 'product' ? 'selected' : ''}>Продукт / новинки</option>
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
            <h3>История и апдейты</h3>
            <p class="small muted">Историю не убирали. Просто разделили экран на спокойную ленту сверху и форму нового апдейта снизу.</p>
          </div>
          ${badge(`${fmt.int(items.length)} записей`, items.length ? 'info' : 'ok')}
        </div>
        <div class="ui-stack">
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
              <label class="ui-field"><span class="ui-label">Срок</span><input name="due" type="date" value="${plusDays(2)}"></label>
          ${fixed ? `<div class="ui-note"><strong>Контур задачи</strong>${escapeHtml(meta(platform).label)}<input type="hidden" name="platform" value="${escapeHtml(platform)}"></div>` : `<label class="ui-field"><span class="ui-label">Контур</span><select name="platform"><option value="cross" ${platform === 'cross' ? 'selected' : ''}>Общий контур</option><option value="wb">РОП WB</option><option value="ozon">РОП Ozon</option><option value="ya">Я.Маркет</option><option value="goldapple">Золотое яблоко</option><option value="letu">Л'Этуаль</option><option value="magnit">Магнит Маркет</option><option value="product">Продукт / новинки</option></select></label>`}
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
        if (submitToRopForm.dataset.sending === '1') return;
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

    const submitToRopForm = body.querySelector('#taskSubmitToRopForm') || body.querySelector('#taskCloseForm');
    if (submitToRopForm && submitToRopForm.dataset.ropSubmitBound !== '1') {
      submitToRopForm.dataset.ropSubmitBound = '1';
      submitToRopForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (submitToRopForm.dataset.sending === '1') return;
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
            submitButton.textContent = 'Saving...';
          }
          const submitFn = typeof window.submitTaskForRopApproval === 'function'
            ? window.submitTaskForRopApproval
            : (typeof submitTaskForRopApproval === 'function' ? submitTaskForRopApproval : null);
          if (typeof submitFn !== 'function') throw new Error('Submit function is unavailable.');
          const updatedTask = await submitFn(taskId, report);
          if (!updatedTask) throw new Error('Task state was not synced.');
          if (typeof pullRemoteState === 'function') {
            try { await pullRemoteState(false); } catch (error) { console.error(error); }
          }
          renderTaskModal(taskId);
        } catch (error) {
          console.error(error);
          alert(error?.message || 'Failed to send task to ROP.');
        } finally {
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
      const form = new FormData(event.currentTarget);
      try {
        const approveFn = typeof window.approveTaskByRop === 'function'
          ? window.approveTaskByRop
          : (typeof approveTaskByRop === 'function' ? approveTaskByRop : null);
        if (typeof approveFn !== 'function') throw new Error('Approve function is unavailable.');
        const updatedTask = await approveFn(taskId, String(form.get('comment') || '').trim());
        if (!updatedTask) {
          alert('Status was not synced. Refresh and retry.');
          return;
        }
        if (typeof pullRemoteState === 'function') {
          try { await pullRemoteState(false); } catch (error) { console.error(error); }
        }
        renderTaskModal(taskId);
      } catch (error) {
        console.error(error);
        alert(error?.message || 'Approval failed. Refresh and retry.');
      }
    });

    const returnButton = body.querySelector('[data-task-return-to-work]');
    if (returnButton && returnButton.dataset.boundReturnRefine !== '1') {
      returnButton.dataset.boundReturnRefine = '1';
      returnButton.addEventListener('click', async () => {
        const comment = String(body.querySelector('#taskRopApproveForm textarea[name="comment"]')?.value || '').trim();
        try {
          const returnFn = typeof window.returnTaskToWork === 'function'
            ? window.returnTaskToWork
            : (typeof returnTaskToWork === 'function' ? returnTaskToWork : null);
          if (typeof returnFn !== 'function') throw new Error('Return function is unavailable.');
          const updatedTask = await returnFn(taskId, comment);
          if (!updatedTask) {
            alert('Task was not returned in shared layer. Refresh and retry.');
            return;
          }
          if (typeof pullRemoteState === 'function') {
            try { await pullRemoteState(false); } catch (error) { console.error(error); }
          }
          renderTaskModal(taskId);
        } catch (error) {
          console.error(error);
          alert(error?.message || 'Failed to return task to work.');
        }
      });
    }

    const finalCloseForm = body.querySelector('#taskFinalCloseForm');
    bindOnce(finalCloseForm, 'boundFinalRefine', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const report = String(form.get('report') || '').trim();
      if (!report) return;
      try {
        const closeFn = typeof window.closeTaskWithReport === 'function'
          ? window.closeTaskWithReport
          : (typeof closeTaskWithReport === 'function' ? closeTaskWithReport : null);
        if (typeof closeFn !== 'function') throw new Error('Final close function is unavailable.');
        const updatedTask = await closeFn(taskId, report);
        if (!updatedTask) {
          alert('Task was not closed in shared layer. Refresh and retry.');
          return;
        }
        if (typeof pullRemoteState === 'function') {
          try { await pullRemoteState(false); } catch (error) { console.error(error); }
        }
        renderTaskModal(taskId);
      } catch (error) {
        console.error(error);
        alert(error?.message || 'Final close failed. Refresh and retry.');
      }
    });
  }

  function taskModalRefined(taskId, skipRemoteSync = false) {
    if (!baseTaskModal) return;
    baseTaskModal(taskId);
    if (!skipRemoteSync && typeof hasRemoteStore === 'function' && hasRemoteStore() && typeof pullRemoteState === 'function') {
      Promise.resolve()
        .then(() => pullRemoteState(false))
        .then(() => {
          if (state?.activeTaskId === taskId) taskModalRefined(taskId, true);
        })
        .catch((error) => console.error(error));
    }
    const taskItem = task(taskId);
    const body = document.getElementById('taskModalBody');
    if (!taskItem || !body) return;
    ensureTaskShareButton(taskId, body);
    const cardsRoot = body.querySelector('.two-col');
    const cards = cardsRoot ? Array.from(cardsRoot.children).filter((node) => node.classList?.contains('card')) : [];
    const closeCard = body.querySelector('#taskCloseForm')?.closest('.card');
    if (closeCard) closeCard.outerHTML = lifecycle(taskItem);
    if (cards[0]) cards[0].outerHTML = editCard(taskItem, owners());
    if (cards[1]) cards[1].outerHTML = updatesCard(taskItem, history(taskId));
    const noteBoxes = body.querySelectorAll('.kv-3 .note-box');
    if (noteBoxes[1]) noteBoxes[1].textContent = 'Маршрут задачи сохранён целиком: исполнитель → РОП → руководитель.';
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

  const CONTROL_SIMPLE_TITLE = 'Сначала выбираем направление, потом работаем с пятью очередями. Полный экран открыт только по кнопке.';
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

  function controlSimpleNormalizeDirection(value) {
    const raw = String(value || 'all').trim().toLowerCase();
    if (raw === 'retail') return 'ya';
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

  function controlSimpleDirectionKey(taskItem) {
    const sku = controlSimpleSku(taskItem);
    try {
      if (typeof controlWorkstreamKey === 'function') {
        const key = controlSimpleNormalizeDirection(controlWorkstreamKey(taskItem, sku));
        if (key !== 'all') return key;
      }
    } catch {}
    const raw = `${taskItem?.platform || ''} ${taskItem?.title || ''} ${taskItem?.nextAction || ''} ${taskItem?.reason || ''} ${taskItem?.entityLabel || ''}`.toLowerCase();
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

  function controlSimpleModel() {
    const search = String(state?.controlFilters?.search || '').trim().toLowerCase();
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
      .filter((taskItem) => {
        if (!search) return true;
        return `${taskItem?.title || ''} ${taskItem?.entityLabel || ''} ${taskItem?.articleKey || ''} ${taskItem?.owner || ''} ${taskItem?.nextAction || ''} ${taskItem?.reason || ''}`.toLowerCase().includes(search);
      });
    const buckets = Object.fromEntries(CONTROL_SIMPLE_QUEUES.map(([key]) => [key, []]));
    tasks.forEach((taskItem) => buckets[controlSimpleQueueKey(taskItem)]?.push(taskItem));
    Object.keys(buckets).forEach((key) => { buckets[key] = controlSimpleSort(buckets[key]); });
    const active = tasks.filter(controlSimpleIsActive);
    return { selected, counts, tasks, buckets, active, overdue: active.filter(controlSimpleIsOverdue), noOwner: active.filter((taskItem) => !taskItem?.owner) };
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

  function controlSimpleWorkstreamPanel(key, tasks) {
    const meta = CONTROL_SIMPLE_META[key] || CONTROL_SIMPLE_META.cross;
    const expanded = state?.controlFilters?.taskSimpleExpandedPlatform === key;
    const sorted = controlSimpleSort(tasks || []);
    const visible = sorted.slice(0, expanded ? 999 : 6);
    const hidden = Math.max(0, sorted.length - visible.length);
    const counts = controlSimpleWorkstreamCounts(sorted);
    const tone = counts.overdue ? 'danger' : counts.sent || counts.noOwner ? 'warn' : counts.active ? 'info' : 'ok';
    return `
      <section class="control-simple-workstream-lane ${counts.active ? '' : 'is-empty'}" data-control-simple-workstream-lane="${escapeHtml(key)}">
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
        <button class="btn ghost small-btn" type="button" data-control-simple-direction="${escapeHtml(key)}">Открыть только ${escapeHtml(meta.label)}</button>
      </section>`;
  }

  function controlSimpleWorkstreamBoard(data) {
    const lanes = CONTROL_SIMPLE_WORKSPACE_ORDER
      .map((key) => ({
        key,
        tasks: (data.tasks || []).filter((taskItem) => controlSimpleDirectionKey(taskItem) === key)
      }))
      .filter((lane) => lane.tasks.length || Number(data.counts?.[lane.key] || 0) > 0);
    return `
      <div class="control-simple-platform-board">
        <div class="control-simple-platform-board-head">
          <div>
            <span>Разделение по площадкам</span>
            <strong>Сначала контур, потом статус</strong>
          </div>
          ${badge(`${fmt.int(data.tasks.length)} задач в общем режиме`, data.tasks.length ? 'info' : 'ok')}
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
    const direction = CONTROL_SIMPLE_META[controlSimpleDirectionKey(taskItem)] || CONTROL_SIMPLE_META.cross;
    return `
      <div class="control-simple-task ${tone ? `is-${tone}` : ''}">
        <button class="control-simple-task-main" type="button" data-control-simple-open-task="${escapeHtml(id)}">
          <strong>${escapeHtml(taskItem?.title || taskItem?.entityLabel || taskItem?.articleKey || 'Задача')}</strong>
          <span>${escapeHtml(taskItem?.owner || 'без owner')} · ${escapeHtml(taskItem?.due || 'без срока')}</span>
          ${next ? `<em>${escapeHtml(next.slice(0, 112))}${next.length > 112 ? '...' : ''}</em>` : ''}
        </button>
        <div class="control-simple-task-foot">
          <span>${escapeHtml(direction.label)}</span>
          <span>${escapeHtml(controlSimpleStatusText(taskItem))}</span>
          <span>${escapeHtml(controlSimplePriorityText(taskItem))}</span>
          <span class="control-simple-actions"><button class="btn small-btn ghost" type="button" data-control-simple-open-task="${escapeHtml(id)}">Открыть</button>${controlSimpleAction(taskItem)}</span>
        </div>
      </div>`;
  }

  function controlSimpleQueuePanel(key, title, hint, tasks) {
    const expanded = state?.controlFilters?.taskSimpleExpandedQueue === key;
    const limit = expanded ? 999 : key === 'confirmed' ? 5 : 6;
    const visible = tasks.slice(0, limit);
    const hidden = Math.max(0, tasks.length - visible.length);
    const tone = key === 'sent' ? 'warn' : key === 'signals' ? 'info' : key === 'confirmed' ? 'ok' : '';
    return `
      <section class="control-simple-queue" data-control-simple-queue="${escapeHtml(key)}">
        <div class="control-simple-queue-head"><div><span>${escapeHtml(hint)}</span><strong>${escapeHtml(title)}</strong></div>${badge(fmt.int(tasks.length), tone)}</div>
        <div class="control-simple-list">
          ${visible.length ? visible.map(controlSimpleTaskCard).join('') : '<div class="control-simple-empty">Пусто. Здесь не горит.</div>'}
          ${hidden ? `<button class="control-simple-more" type="button" data-control-simple-expand="${escapeHtml(key)}">Ещё ${fmt.int(hidden)}</button>` : ''}
        </div>
      </section>`;
  }

  function controlSimpleCreateForm(selected) {
    const direction = CONTROL_SIMPLE_META[selected] ? selected : 'cross';
    return `
      <details class="control-simple-create" ${state?.controlFilters?.taskSimpleCreateOpen ? 'open' : ''}>
        <summary><span><strong>Поставить задачу</strong><em>что сделать, кому, срок</em></span>${badge('короткая форма', 'info')}</summary>
        <form id="controlSimpleCreateForm" class="control-simple-form">
          <input name="title" placeholder="Что нужно сделать" required>
          <select name="platform">${CONTROL_SIMPLE_DIRECTIONS.filter(([key]) => key !== 'all').map(([key, label]) => `<option value="${escapeHtml(key)}" ${direction === key ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>
          <input name="owner" list="controlSimpleOwnerList" placeholder="Кто делает">
          <input name="due" type="date" value="${plusDays(2)}">
          <select name="type"><option value="general">Общее</option><option value="price_margin">Цена / маржа</option><option value="traffic">Трафик</option><option value="content">Контент</option><option value="supply">Остатки</option><option value="launch">Новинка</option><option value="assignment">Назначение owner</option></select>
          <select name="priority"><option value="high">Высокий</option><option value="medium">Средний</option><option value="critical">Критично</option><option value="low">Низкий</option></select>
          <input name="entityLabel" placeholder="SKU / тема / проект">
          <textarea name="nextAction" rows="3" placeholder="Первый шаг или критерий готовности"></textarea>
          <button class="btn primary" type="submit">Создать</button>
        </form>
        <datalist id="controlSimpleOwnerList">${owners().map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
      </details>`;
  }

  function controlSimpleDirectionButton(key, data) {
    const meta = CONTROL_SIMPLE_META[key] || CONTROL_SIMPLE_META.cross;
    const count = Number(data?.counts?.[key] || 0);
    const active = data?.selected === key;
    const manager = key === 'all';
    return `<button class="control-simple-direction ${active ? 'active' : ''} ${manager ? 'is-manager' : ''}" type="button" data-control-simple-direction="${escapeHtml(key)}"><strong>${escapeHtml(meta.label)}</strong><span>${escapeHtml(manager ? 'для руководителя' : meta.hint)}</span><b>${fmt.int(count)}</b></button>`;
  }

  function controlSimpleWorkspacePanel(data) {
    const selectedMeta = CONTROL_SIMPLE_META[data.selected] || CONTROL_SIMPLE_META.cross;
    const selectedCount = Number(data.counts?.[data.selected] || 0);
    const selectedText = data.selected === 'all'
      ? 'Показаны все контуры. Это режим руководителя, не рабочее место РОПа.'
      : `Показаны только задачи контура: ${selectedMeta.label}. Остальные не мешают в очередях.`;
    return `
      <div class="control-simple-workspace">
        <div class="control-simple-workspace-head">
          <div>
            <span>Рабочее место</span>
            <strong>Сначала выберите площадку</strong>
            <em>${escapeHtml(selectedText)}</em>
          </div>
          <div class="control-simple-selected">
            <span>Открыто сейчас</span>
            <strong>${escapeHtml(selectedMeta.label)}</strong>
            <b>${fmt.int(data.selected === 'all' ? data.tasks.length : selectedCount)} задач</b>
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
      root.insertAdjacentHTML('afterbegin', `<div class="control-simple-return"><button class="btn primary" type="button" data-control-simple-return>Вернуться в простой режим</button>${badge('полный режим', 'warn')}</div>`);
      root.querySelector('[data-control-simple-return]')?.addEventListener('click', () => {
        state.controlFilters.taskSimpleFullMode = false;
        controlRefined();
      });
      return;
    }

    const data = controlSimpleModel();
    const boardHtml = data.selected === 'all'
      ? controlSimpleWorkstreamBoard(data)
      : `<div class="control-simple-board">${CONTROL_SIMPLE_QUEUES.map(([key, title, hint]) => controlSimpleQueuePanel(key, title, hint, data.buckets[key] || [])).join('')}</div>`;
    root.dataset.controlSimple = '20260516taskworkspace2';
    root.innerHTML = `
      <div class="section-title control-simple-title">
        <div><h2>Задачи</h2><div class="control-simple-title-copy">${escapeHtml(CONTROL_SIMPLE_TITLE)}</div></div>
        <div class="badge-stack">${badge(`${fmt.int(data.active.length)} активных`, data.active.length ? 'info' : 'ok')}${badge(`${fmt.int(data.overdue.length)} просрочено`, data.overdue.length ? 'danger' : 'ok')}${badge(`${fmt.int(data.noOwner.length)} без owner`, data.noOwner.length ? 'warn' : 'ok')}</div>
      </div>
      <div class="control-simple-panel">
        ${controlSimpleWorkspacePanel(data)}
        <div class="control-simple-topbar">
          <input id="controlSimpleSearch" value="${escapeHtml(state.controlFilters.search || '')}" placeholder="Поиск по задаче, SKU, owner">
          <div class="badge-stack"><button class="btn primary" type="button" data-control-simple-create-toggle>Новая задача</button><button class="btn ghost" type="button" data-control-simple-full>Полный режим</button></div>
        </div>
        <div class="control-simple-summary">
          <span><b>${fmt.int(data.buckets.new.length)}</b> новые</span><span><b>${fmt.int(data.buckets.signals.length)}</b> автосигналы</span><span><b>${fmt.int(data.buckets.common.length)}</b> общие</span><span><b>${fmt.int(data.buckets.sent.length)}</b> отправленные</span><span><b>${fmt.int(data.buckets.confirmed.length)}</b> подтвержденные</span>
        </div>
        ${controlSimpleCreateForm(data.selected)}
        ${boardHtml}
        <div class="control-simple-legend"><strong>Статусы:</strong><span>Новые = ещё не сданы</span><span>Автосигналы = нашёл портал</span><span>Общие = без SKU или общий контур</span><span>Отправленные = ждут согласования</span><span>Подтвержденные = done</span></div>
      </div>`;

    root.querySelector('#controlSimpleSearch')?.addEventListener('input', (event) => {
      state.controlFilters.search = event.target.value;
      controlRefined();
    });
    root.querySelectorAll('[data-control-simple-direction]').forEach((button) => button.addEventListener('click', () => {
      const key = controlSimpleNormalizeDirection(button.dataset.controlSimpleDirection);
      state.controlFilters.platform = key;
      state.controlFilters.peopleRole = key === 'all' || key === 'cross' ? 'leader' : key;
      state.controlFilters.taskSimpleWorkspaceChosen = true;
      state.controlFilters.taskSimpleExpandedQueue = '';
      state.controlFilters.taskSimpleExpandedPlatform = '';
      state.controlFilters.status = 'active';
      state.controlFilters.horizon = 'all';
      state.controlFilters.source = 'all';
      controlRefined();
    }));
    root.querySelector('[data-control-simple-create-toggle]')?.addEventListener('click', () => {
      state.controlFilters.taskSimpleCreateOpen = !state.controlFilters.taskSimpleCreateOpen;
      controlRefined();
    });
    root.querySelector('[data-control-simple-full]')?.addEventListener('click', () => {
      state.controlFilters.taskSimpleFullMode = true;
      controlRefined();
    });
    root.querySelectorAll('[data-control-simple-expand]').forEach((button) => button.addEventListener('click', () => {
      state.controlFilters.taskSimpleExpandedQueue = button.dataset.controlSimpleExpand || '';
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
      await controlSimpleRunAction(button.dataset.controlSimpleAction, button.dataset.taskId);
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
