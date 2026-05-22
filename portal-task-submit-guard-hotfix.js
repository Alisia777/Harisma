(function () {
  if (window.__ALTEA_TASK_SUBMIT_GUARD_20260522_SIMPLE__) return;
  window.__ALTEA_TASK_SUBMIT_GUARD_20260522_SIMPLE__ = true;

  const RECENT_DUPLICATE_MS = 120000;
  const PENDING_KEEP_MS = 5000;
  const FORM_TIMEOUT_MS = 45000;
  const CREATE_TIMEOUT_MS = 8000;
  const PENDING_KEY = 'altea_task_workflow_pending_v1';
  const GUARDED_FORM_SELECTOR = '#generalTaskForm, #manualTaskForm, #controlSimpleCreateForm, #generalQuickTaskForm';
  const QUICK_FORM_SELECTOR = '#controlSimpleCreateForm, #generalQuickTaskForm';
  const pendingByKey = new Map();

  function clean(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  }

  function lower(value) {
    return clean(value).toLowerCase();
  }

  function payloadKey(payload = {}) {
    const title = lower(payload.title);
    const nextAction = lower(payload.nextAction);
    if (!title && !nextAction) return '';
    return [
      lower(payload.articleKey),
      lower(payload.entityLabel),
      title,
      lower(payload.type || 'general'),
      lower(payload.priority || 'medium'),
      lower(payload.platform || 'cross'),
      lower(payload.owner),
      clean(payload.due),
      nextAction,
      lower(payload.reason)
    ].join('|');
  }

  function taskKey(task = {}) {
    return payloadKey({
      articleKey: task.articleKey,
      entityLabel: task.entityLabel,
      title: task.title,
      type: task.type,
      priority: task.priority,
      platform: task.platform,
      owner: task.owner,
      due: task.due,
      nextAction: task.nextAction,
      reason: task.reason
    });
  }

  function stateTasks() {
    return Array.isArray(window.state?.storage?.tasks) ? window.state.storage.tasks : [];
  }

  function findRecentDuplicate(payload, key) {
    const now = Date.now();
    return stateTasks().find((task) => {
      if (!task || task.source === 'auto') return false;
      if (taskKey(task) !== key) return false;
      const stamp = Date.parse(task.createdAt || task.updatedAt || '');
      return Number.isFinite(stamp) && now - stamp >= 0 && now - stamp <= RECENT_DUPLICATE_MS;
    }) || null;
  }

  function releaseBusyForms() {
    document.querySelectorAll(`${GUARDED_FORM_SELECTOR}[data-portal-task-submitting="1"]`).forEach((form) => {
      form.dataset.portalTaskSubmitting = '';
      form.removeAttribute('aria-busy');
      form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach((button) => {
        button.disabled = false;
        if (button.dataset.portalSubmitLabel) {
          button.textContent = button.dataset.portalSubmitLabel;
          delete button.dataset.portalSubmitLabel;
        }
      });
    });
  }

  function markFormBusy(form) {
    if (!form || form.dataset.portalTaskSubmitting === '1') return false;
    form.dataset.portalTaskSubmitting = '1';
    form.setAttribute('aria-busy', 'true');
    form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach((button) => {
      if (!button.dataset.portalSubmitLabel) button.dataset.portalSubmitLabel = button.textContent || button.value || '';
      button.disabled = true;
      if (button.tagName === 'BUTTON') button.textContent = '\u0421\u043e\u0437\u0434\u0430\u0435\u043c...';
      else button.value = '\u0421\u043e\u0437\u0434\u0430\u0435\u043c...';
    });
    window.setTimeout(() => {
      if (form.isConnected && form.dataset.portalTaskSubmitting === '1') releaseBusyForms();
    }, FORM_TIMEOUT_MS);
    return true;
  }

  function appState() {
    try {
      if (typeof state !== 'undefined') return state;
    } catch {}
    return window.state || null;
  }

  function makeId(prefix) {
    if (typeof window.uid === 'function') return window.uid(prefix);
    try {
      if (typeof uid === 'function') return uid(prefix);
    } catch {}
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function plusDaysSafe(days) {
    if (typeof window.plusDays === 'function') return window.plusDays(days);
    try {
      if (typeof plusDays === 'function') return plusDays(days);
    } catch {}
    const date = new Date();
    date.setDate(date.getDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }

  function saveNow() {
    try {
      if (typeof window.saveLocalStorage === 'function') window.saveLocalStorage();
      else if (typeof saveLocalStorage === 'function') saveLocalStorage();
    } catch (error) {
      console.error('[task-submit-guard] local save failed', error);
    }
  }

  function invalidateTaskCache() {
    try {
      if (typeof window.invalidateControlTaskCache === 'function') window.invalidateControlTaskCache();
    } catch {}
  }

  function readPending() {
    try {
      const parsed = JSON.parse(window.localStorage?.getItem(PENDING_KEY) || '{}');
      return {
        tasks: parsed && typeof parsed.tasks === 'object' && parsed.tasks ? parsed.tasks : {},
        comments: parsed && typeof parsed.comments === 'object' && parsed.comments ? parsed.comments : {}
      };
    } catch {
      return { tasks: {}, comments: {} };
    }
  }

  function rememberPending(kind, item) {
    const id = String(item?.id || '').trim();
    if (!id) return;
    try {
      const pending = readPending();
      const bucket = kind === 'comment' ? 'comments' : 'tasks';
      pending[bucket][id] = { ...item };
      window.localStorage?.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch (error) {
      console.error('[task-submit-guard] pending save failed', error);
    }
  }

  function schedulePersist(kind, item) {
    window.setTimeout(() => {
      const fn = kind === 'comment'
        ? (window.persistComment || (typeof persistComment === 'function' ? persistComment : null))
        : (window.persistTask || (typeof persistTask === 'function' ? persistTask : null));
      if (typeof fn !== 'function' || !item) return;
      Promise.resolve(fn(item)).catch((error) => console.error(`[task-submit-guard] ${kind} remote retry failed`, error));
    }, 1500);
  }

  function normalizeTaskSafe(task) {
    try {
      if (typeof window.normalizeTask === 'function') return window.normalizeTask(task, 'manual');
    } catch {}
    try {
      if (typeof normalizeTask === 'function') return normalizeTask(task, 'manual');
    } catch {}
    return task;
  }

  function normalizeCommentSafe(comment) {
    try {
      if (typeof window.normalizeComment === 'function') return window.normalizeComment(comment);
    } catch {}
    try {
      if (typeof normalizeComment === 'function') return normalizeComment(comment);
    } catch {}
    return comment;
  }

  function quickTaskPayload(form) {
    const data = new FormData(form);
    const app = appState();
    const platform = clean(data.get('platform')) || clean(app?.controlFilters?.platform) || 'cross';
    const fallbackEntity = form.id === 'generalQuickTaskForm' ? '\u041e\u0431\u0449\u0430\u044f \u0437\u0430\u0434\u0430\u0447\u0430' : '';
    return {
      articleKey: '',
      entityLabel: data.get('entityLabel') || fallbackEntity,
      title: data.get('title'),
      type: data.get('type') || 'general',
      priority: data.get('priority') || 'high',
      platform,
      owner: data.get('owner'),
      due: data.get('due'),
      nextAction: data.get('nextAction'),
      reason: data.get('reason') || '\u0421\u043e\u0437\u0434\u0430\u043d\u043e \u0438\u0437 \u043f\u0440\u043e\u0441\u0442\u043e\u0433\u043e \u044d\u043a\u0440\u0430\u043d\u0430 \u0437\u0430\u0434\u0430\u0447'
    };
  }

  function appendFallbackHistory(task) {
    const app = appState();
    if (!app?.storage || !task?.id) return;
    app.storage.comments = Array.isArray(app.storage.comments) ? app.storage.comments : [];
    const message = `[[task:${task.id}]] [[kind:created]] \u0417\u0430\u0434\u0430\u0447\u0430 \u0441\u043e\u0437\u0434\u0430\u043d\u0430${task.owner ? ` \u00b7 owner ${task.owner}` : ''}${task.due ? ` \u00b7 \u0441\u0440\u043e\u043a ${task.due}` : ''}.`;
    const comment = normalizeCommentSafe({
      id: makeId('comment'),
      articleKey: task.articleKey || '',
      author: app.team?.member?.name || task.owner || '\u041a\u043e\u043c\u0430\u043d\u0434\u0430',
      team: typeof window.teamMemberLabel === 'function' ? window.teamMemberLabel() : '\u041a\u043e\u043c\u0430\u043d\u0434\u0430',
      type: 'task_log',
      text: message,
      createdAt: new Date().toISOString()
    });
    app.storage.comments.unshift(comment);
    rememberPending('comment', comment);
    schedulePersist('comment', comment);
  }

  function createLocalTaskFallback(payload) {
    const app = appState();
    if (!app?.storage) return null;
    const key = payloadKey(payload);
    const existing = key ? findRecentDuplicate(payload, key) : null;
    if (existing) return existing;

    app.storage.tasks = Array.isArray(app.storage.tasks) ? app.storage.tasks : [];
    const now = new Date().toISOString();
    const task = normalizeTaskSafe({
      id: makeId('task'),
      source: 'manual',
      articleKey: payload.articleKey || '',
      entityLabel: payload.entityLabel,
      title: clean(payload.title) || '\u041d\u043e\u0432\u0430\u044f \u0437\u0430\u0434\u0430\u0447\u0430',
      type: payload.type || 'general',
      priority: payload.priority || 'high',
      platform: payload.platform || 'cross',
      owner: clean(payload.owner),
      due: payload.due || plusDaysSafe(3),
      status: 'new',
      nextAction: clean(payload.nextAction),
      reason: clean(payload.reason),
      createdAt: now,
      updatedAt: now
    });
    app.storage.tasks.unshift(task);
    invalidateTaskCache();
    rememberPending('task', task);
    appendFallbackHistory(task);
    saveNow();
    schedulePersist('task', task);
    return task;
  }

  function withTimeout(promise, ms) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error('Task creation timed out; local fallback used.')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) window.clearTimeout(timer);
    });
  }

  async function createTaskWithFallback(payload) {
    const fn = window.createManualTask || (typeof createManualTask === 'function' ? createManualTask : null);
    let lastError = null;
    if (typeof fn === 'function') {
      const taskPromise = Promise.resolve()
        .then(() => fn(payload))
        .catch((error) => {
          lastError = error;
          throw error;
        });
      taskPromise.catch((error) => console.error('[task-submit-guard] quick create failed', error));
      try {
        const task = await withTimeout(taskPromise, CREATE_TIMEOUT_MS);
        if (task?.id) return task;
      } catch (error) {
        lastError = error;
        console.warn('[task-submit-guard] quick create fallback', error);
      }
    }

    const key = payloadKey(payload);
    const existing = key ? findRecentDuplicate(payload, key) : null;
    if (existing) return existing;
    const fallback = createLocalTaskFallback(payload);
    if (fallback?.id) return fallback;
    if (lastError) throw lastError;
    throw new Error('Task creation is unavailable.');
  }

  function renderAfterQuickCreate(form, task) {
    const app = appState();
    if (app?.controlFilters) {
      if (form.id === 'controlSimpleCreateForm') app.controlFilters.taskSimpleCreateOpen = false;
      app.controlFilters.lazyQueue = 'general';
    }
    invalidateTaskCache();
    try {
      if (form.id === 'controlSimpleCreateForm' && typeof window.controlRefined === 'function') window.controlRefined();
      else if (typeof window.renderControlCenter === 'function') window.renderControlCenter();
      else if (typeof window.rerenderCurrentView === 'function') window.rerenderCurrentView();
    } catch (error) {
      console.error('[task-submit-guard] quick create render failed', error);
    }
    try {
      if (task?.id && typeof window.renderTaskModal === 'function') window.renderTaskModal(task.id);
      else if (task?.id && typeof window.openTaskModal === 'function') window.openTaskModal(task.id);
    } catch (error) {
      console.error('[task-submit-guard] quick create modal failed', error);
    }
  }

  async function runQuickTaskSubmit(form) {
    if (!form || form.dataset.portalQuickTaskSubmitting === '1') return;
    form.dataset.portalQuickTaskSubmitting = '1';
    markFormBusy(form);
    try {
      const payload = quickTaskPayload(form);
      const task = await createTaskWithFallback(payload);
      if (!task?.id) throw new Error('Task was not created.');
      renderAfterQuickCreate(form, task);
    } finally {
      if (form.isConnected) {
        form.dataset.portalQuickTaskSubmitting = '';
        releaseBusyForms();
      }
    }
  }

  function installFormGuard() {
    document.addEventListener('submit', (event) => {
      const form = event.target?.closest?.(GUARDED_FORM_SELECTOR);
      if (!form) return;
      if (form.dataset.portalTaskSubmitting === '1') {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      markFormBusy(form);
    }, true);

    document.addEventListener('click', (event) => {
      const button = event.target?.closest?.('button[type="submit"], input[type="submit"]');
      const form = button?.form?.matches?.(GUARDED_FORM_SELECTOR) ? button.form : null;
      if (!form || form.dataset.portalTaskSubmitting !== '1') return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);

    document.addEventListener('submit', (event) => {
      const form = event.target?.closest?.(QUICK_FORM_SELECTOR);
      if (!form) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      runQuickTaskSubmit(form).catch((error) => {
        console.error('[task-submit-guard] quick form submit failed', error);
        releaseBusyForms();
        window.alert(error?.message || 'Task was saved locally, but the shared layer needs a retry.');
      });
    }, true);
  }

  function installCreateTaskGuard() {
    const original = window.createManualTask || (typeof createManualTask === 'function' ? createManualTask : null);
    if (typeof original !== 'function' || original.__alteaTaskSubmitGuarded) return Boolean(original?.__alteaTaskSubmitGuarded);

    const guarded = async function guardedCreateManualTask(payload = {}) {
      const key = payloadKey(payload);
      if (key) {
        const existing = findRecentDuplicate(payload, key);
        if (existing) {
          window.setTimeout(releaseBusyForms, 600);
          return existing;
        }
        if (pendingByKey.has(key)) return pendingByKey.get(key);
      }

      const promise = Promise.resolve()
        .then(() => original.call(this, payload))
        .finally(() => {
          window.setTimeout(releaseBusyForms, 600);
          if (key) window.setTimeout(() => pendingByKey.delete(key), PENDING_KEEP_MS);
        });

      if (key) pendingByKey.set(key, promise);
      return promise;
    };
    guarded.__alteaTaskSubmitGuarded = true;
    guarded.__alteaOriginalCreateManualTask = original;

    window.createManualTask = guarded;
    try { createManualTask = guarded; } catch {}
    return true;
  }

  installFormGuard();
  installCreateTaskGuard();
  window.addEventListener('load', installCreateTaskGuard, { once: true });
  const guardTimer = window.setInterval(installCreateTaskGuard, 500);
  window.setTimeout(() => window.clearInterval(guardTimer), 30000);
})();
