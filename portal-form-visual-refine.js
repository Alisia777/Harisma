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
    executive: { label: 'Руководитель / директор', chip: 'Директор', kind: 'danger' },
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
  const baseTaskModal = typeof window.renderTaskModal === 'function' ? window.renderTaskModal : null;
  const baseControl = typeof window.renderControlCenter === 'function' ? window.renderControlCenter : null;

  const meta = (k) => WS[k] || WS.cross;
  const task = (id) => typeof getTask === 'function' ? getTask(id) : null;
  const history = (id) => typeof getTaskHistory === 'function' ? getTaskHistory(id) : [];
  const owners = () => typeof ownerOptions === 'function' ? ownerOptions() : [];
  const normPlatform = (v) => {
    const raw = String(v || '').trim().toLowerCase();
    if (raw === 'retail') return 'ya';
    return ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'product', 'executive', 'cross'].includes(raw) ? raw : 'cross';
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
              <option value="executive" ${currentPlatform === 'executive' ? 'selected' : ''}>Руководитель / директор</option>
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
          ${fixed ? `<div class="ui-note"><strong>Контур задачи</strong>${escapeHtml(meta(platform).label)}<input type="hidden" name="platform" value="${escapeHtml(platform)}"></div>` : `<label class="ui-field"><span class="ui-label">Контур</span><select name="platform"><option value="cross" ${platform === 'cross' ? 'selected' : ''}>Общий контур</option><option value="wb">РОП WB</option><option value="ozon">РОП Ozon</option><option value="ya">Я.Маркет</option><option value="goldapple">Золотое яблоко</option><option value="letu">Л'Этуаль</option><option value="magnit">Магнит Маркет</option><option value="product">Продукт / новинки</option><option value="executive">Руководитель / директор</option></select></label>`}
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

  function executiveRefined() {
    const root = document.getElementById('view-executive');
    if (!root || typeof getControlSnapshot !== 'function') return;
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
    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Руководителю</h2>
          <p>Все сигналы сохранены. Экран стал чище: отдельно видна очередь руководителя, очередь РОПа, риски по owner и общая нагрузка команды.</p>
        </div>
        <div class="badge-stack">${badge(`${fmt.int(waiting.length)} ждут финала`, waiting.length ? 'warn' : 'ok')}${badge(`${fmt.int(waitingRop.length)} у РОПа`, waitingRop.length ? 'info' : 'ok')}</div>
      </div>
      <div class="kpi-strip">
        <div class="mini-kpi warn"><span>Финальное согласование</span><strong>${fmt.int(waiting.length)}</strong><span>готовы к закрытию</span></div>
        <div class="mini-kpi"><span>Согласование у РОПа</span><strong>${fmt.int(waitingRop.length)}</strong><span>ещё не дошли до финала</span></div>
        <div class="mini-kpi danger"><span>Критично</span><strong>${fmt.int(critical.length)}</strong><span>риски и блокеры</span></div>
        <div class="mini-kpi danger"><span>Просрочено</span><strong>${fmt.int(overdue.length)}</strong><span>нужен апдейт срока</span></div>
        <div class="mini-kpi warn"><span>Без owner</span><strong>${fmt.int(noOwner.length)}</strong><span>нужно закрепление</span></div>
        <div class="mini-kpi"><span>Активно в контуре</span><strong>${fmt.int(active.length)}</strong><span>все задачи сейчас</span></div>
      </div>
      <div class="two-col" style="margin-top:14px">
        <div class="card"><div class="section-subhead"><div><h3>На финальном согласовании</h3><p class="small muted">Очередь задач, которые уже прошли РОПа и ждут решения руководителя.</p></div>${badge(`${fmt.int(waiting.length)} шт.`, waiting.length ? 'warn' : 'ok')}</div><div class="task-mini-grid">${waiting.map(renderMiniTask).join('') || '<div class="empty">Нет задач на финальном согласовании</div>'}</div></div>
        <div class="card"><div class="section-subhead"><div><h3>На согласовании у РОПа</h3><p class="small muted">Очередь предыдущего шага, чтобы руководитель видел, что скоро перейдёт ему.</p></div>${badge(`${fmt.int(waitingRop.length)} шт.`, waitingRop.length ? 'info' : 'ok')}</div><div class="task-mini-grid">${waitingRop.map(renderMiniTask).join('') || '<div class="empty">У РОПа нет задач на согласовании</div>'}</div></div>
      </div>
      <div class="two-col" style="margin-top:14px">
        <div class="card"><div class="section-subhead"><div><h3>Что требует решения сегодня</h3><p class="small muted">Критичное, просрочки, задачи без owner и всё, что уже близко к финалу.</p></div>${badge(`${fmt.int(escalations.length)} в фокусе`, escalations.length ? 'danger' : 'ok')}</div><div class="task-mini-grid">${escalations.map(renderMiniTask).join('') || '<div class="empty">Срочных эскалаций нет</div>'}</div></div>
        <div class="card"><div class="section-subhead"><div><h3>Нагрузка по owner</h3><p class="small muted">Полная картина по владельцам задач сохранена, но стала спокойнее и читабельнее.</p></div>${badge(`${fmt.int((control.byOwner || []).length)} owner`, (control.byOwner || []).length ? 'info' : 'ok')}</div><div class="owner-summary">${ownerRows((control.byOwner || []).slice(0, 6)) || '<div class="empty">Появится после закрепления задач за owner</div>'}</div></div>
      </div>
      <div class="two-col" style="margin-top:14px">
        <div class="card"><div class="section-subhead"><div><h3>Где не хватает owner</h3><p class="small muted">Отдельный блок, чтобы задачи без ответственного не терялись внутри общей витрины.</p></div>${badge(`${fmt.int(noOwner.length)} без owner`, noOwner.length ? 'warn' : 'ok')}</div><div class="task-mini-grid">${noOwner.slice(0, 8).map(renderMiniTask).join('') || '<div class="empty">Все активные задачи уже закреплены</div>'}</div></div>
        <div class="card"><div class="section-subhead"><div><h3>Новинки и SKU без owner</h3><p class="small muted">Блок остался полным, но теперь в нём проще читать запуск и отсутствие владельца по SKU.</p></div>${badge(`${fmt.int(launches.length + unassigned.length)} сигналов`, (launches.length + unassigned.length) ? 'info' : 'ok')}</div><div class="alert-stack">${launches.map((item) => `<div class="alert-row"><div><strong>${escapeHtml(item.name || 'Новинка')}</strong><div class="muted small">${escapeHtml(item.launchMonth || '—')} · ${escapeHtml(item.reportGroup || '—')}</div></div><div class="badge-stack">${badge(item.tag || 'новинка', 'info')}${item.production ? badge(item.production) : ''}</div><div class="muted small">${escapeHtml(item.status || 'Статус не указан')}</div></div>`).join('')}${unassigned.map((sku) => `<div class="alert-row"><div><strong>${linkToSku(sku.articleKey, sku.article || sku.articleKey)}</strong><div class="muted small">${escapeHtml(sku.name || 'Без названия')}</div></div><div class="badge-stack">${badge('Без owner', 'warn')}${typeof skuOperationalStatus === 'function' ? skuOperationalStatus(sku) : ''}</div><div class="muted small">${escapeHtml(sku.focusReasons || 'Нужно закрепить owner и сценарий работы')}</div></div>`).join('') || '<div class="empty">Нет запусков и SKU без owner в текущем фокусе</div>'}</div></div>
      </div>`;
  }

  function controlRefined() {
    if (baseControl) baseControl();
    const root = document.getElementById('view-control');
    if (!root) return;
    const title = root.querySelector('.section-title p');
    if (title) title.textContent = 'Функционал не сокращали: все шаги и поля сохранены, просто форма и карточка задачи стали визуально чище и понятнее.';
    const tasks = typeof filteredControlTasks === 'function' ? filteredControlTasks() : [];
    const selected = WS[state?.controlFilters?.platform] ? state.controlFilters.platform : 'all';
    const cardsRoot = root.querySelector('.two-col');
    const cards = cardsRoot ? Array.from(cardsRoot.children).filter((node) => node.classList?.contains('card')) : [];
    if (cards[0]) cards[0].outerHTML = generalCard(selected, owners(), tasks.filter((item) => ['waiting_rop', 'waiting_decision'].includes(item.status)).length);
    const form = root.querySelector('#generalTaskForm');
    if (form && !form.dataset.visualBound) {
      form.dataset.visualBound = 'true';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const articleKeys = parseTaskArticleKeysInput(data.get('articleKeys'));
        const basePayload = {
          entityLabel: data.get('entityLabel'),
          title: data.get('title'),
          type: data.get('type') || 'general',
          priority: data.get('priority') || 'high',
          platform: data.get('platform') || (selected !== 'all' ? selected : 'cross'),
          owner: data.get('owner'),
          due: data.get('due'),
          nextAction: normalizeMultilineTaskText(data.get('nextAction')),
          reason: normalizeMultilineTaskText(data.get('reason'))
        };

        if (!articleKeys.length) {
          const created = await createManualTask({
            articleKey: '',
            ...basePayload
          });
          renderControlCenter();
          if (created?.id) renderTaskModal(created.id);
          return;
        }

        const createdTasks = [];
        for (const articleKey of articleKeys) {
          const sku = typeof getSku === 'function' ? getSku(articleKey) : null;
          const created = await createManualTask({
            articleKey,
            ...basePayload,
            entityLabel: basePayload.entityLabel || sku?.name || articleKey,
            owner: String(basePayload.owner || ownerName(sku) || '').trim(),
            skipRerender: true
          });
          if (created?.id) createdTasks.push(created);
        }
        renderControlCenter();
        if (createdTasks.length) {
          renderTaskModal(createdTasks[0].id);
        }
      });
    }
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
