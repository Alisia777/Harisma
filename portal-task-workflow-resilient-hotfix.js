(function () {
  if (window.__ALTEA_TASK_WORKFLOW_RESILIENT_20260521__) return;
  window.__ALTEA_TASK_WORKFLOW_RESILIENT_20260521__ = true;

  const RETRY_DELAYS = [3000, 10000, 30000, 60000, 120000];
  const PENDING_KEY = 'altea_task_workflow_pending_v1';

  function appState() {
    try {
      if (typeof state !== 'undefined') return state;
    } catch {}
    return null;
  }

  function makeId(prefix) {
    if (typeof window.uid === 'function') return window.uid(prefix);
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function saveNow() {
    try {
      if (typeof window.saveLocalStorage === 'function') window.saveLocalStorage();
      else if (typeof saveLocalStorage === 'function') saveLocalStorage();
    } catch (error) {
      console.error('[task-workflow-resilient] local save', error);
    }
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

  function writePending(pending) {
    try {
      window.localStorage?.setItem(PENDING_KEY, JSON.stringify({
        tasks: pending?.tasks || {},
        comments: pending?.comments || {}
      }));
    } catch (error) {
      console.error('[task-workflow-resilient] pending save', error);
    }
  }

  function pendingBucket(kind) {
    return kind === 'comment' ? 'comments' : 'tasks';
  }

  function rememberPending(kind, item) {
    const id = String(item?.id || '').trim();
    if (!id) return;
    const pending = readPending();
    pending[pendingBucket(kind)][id] = { ...item };
    writePending(pending);
  }

  function forgetPending(kind, id) {
    const key = String(id || '').trim();
    if (!key) return;
    const pending = readPending();
    delete pending[pendingBucket(kind)][key];
    writePending(pending);
  }

  function applyPendingWorkflow() {
    const app = appState();
    if (!app?.storage) return false;
    const pending = readPending();
    let changed = false;

    app.storage.tasks = Array.isArray(app.storage.tasks) ? app.storage.tasks : [];
    Object.values(pending.tasks || {}).forEach((task) => {
      if (!task?.id) return;
      const index = app.storage.tasks.findIndex((item) => String(item?.id || '') === String(task.id));
      if (index >= 0) Object.assign(app.storage.tasks[index], task);
      else app.storage.tasks.unshift({ ...task });
      changed = true;
    });

    app.storage.comments = Array.isArray(app.storage.comments) ? app.storage.comments : [];
    Object.values(pending.comments || {}).forEach((comment) => {
      if (!comment?.id) return;
      const exists = app.storage.comments.some((item) => String(item?.id || '') === String(comment.id));
      if (!exists) {
        app.storage.comments.push({ ...comment });
        changed = true;
      }
    });

    if (changed) {
      try {
        if (typeof window.invalidateControlTaskCache === 'function') window.invalidateControlTaskCache();
      } catch {}
      saveNow();
    }
    return changed;
  }

  function schedulePersist(kind, item, attempt = 0) {
    const fn = kind === 'comment'
      ? (window.persistComment || (typeof persistComment === 'function' ? persistComment : null))
      : (window.persistTask || (typeof persistTask === 'function' ? persistTask : null));
    if (typeof fn !== 'function' || !item) return;
    Promise.resolve()
      .then(() => fn(item))
      .then(() => forgetPending(kind, item.id))
      .catch((error) => {
        console.error(`[task-workflow-resilient] ${kind} persist`, error);
        const delay = RETRY_DELAYS[attempt];
        if (delay) window.setTimeout(() => schedulePersist(kind, item, attempt + 1), delay);
      });
  }

  function flushPendingWorkflow() {
    const pending = readPending();
    Object.values(pending.tasks || {}).forEach((task) => schedulePersist('task', task));
    Object.values(pending.comments || {}).forEach((comment) => schedulePersist('comment', comment));
  }

  function wrapPullRemoteState() {
    const original = window.pullRemoteState || (typeof pullRemoteState === 'function' ? pullRemoteState : null);
    if (typeof original !== 'function' || original.__taskWorkflowPendingWrapped) return;
    const wrapped = async function pullRemoteStateWithWorkflowPending(...args) {
      const result = await original.apply(this, args);
      applyPendingWorkflow();
      return result;
    };
    wrapped.__taskWorkflowPendingWrapped = true;
    wrapped.__taskWorkflowPendingOriginal = original;
    window.pullRemoteState = wrapped;
    try { pullRemoteState = wrapped; } catch {}
  }

  function getTaskFromAnyLayer(taskId) {
    const id = String(taskId || '').trim();
    if (!id) return null;
    try {
      if (typeof window.getTask === 'function') {
        const task = window.getTask(id);
        if (task) return task;
      }
    } catch {}
    try {
      if (typeof window.getAllTasks === 'function') {
        return (window.getAllTasks() || []).find((task) => String(task?.id || '') === id) || null;
      }
    } catch {}
    const app = appState();
    return (app?.storage?.tasks || []).find((task) => String(task?.id || '') === id) || null;
  }

  function materializeTask(taskId) {
    const app = appState();
    if (!app?.storage) return null;
    app.storage.tasks = Array.isArray(app.storage.tasks) ? app.storage.tasks : [];
    const id = String(taskId || '').trim();
    const existing = app.storage.tasks.find((task) => String(task?.id || '') === id);
    if (existing) return existing;
    const source = getTaskFromAnyLayer(id);
    if (!source) return null;
    const task = {
      ...source,
      id,
      source: source.source || 'manual',
      createdAt: source.createdAt || source.created_at || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    app.storage.tasks.unshift(task);
    return task;
  }

  function renderAfterTaskChange(task) {
    try {
      if (typeof window.invalidateControlTaskCache === 'function') window.invalidateControlTaskCache();
    } catch {}
    rememberPending('task', task);
    saveNow();
    schedulePersist('task', task);
    try {
      if (typeof window.rerenderCurrentView === 'function') window.rerenderCurrentView();
    } catch (error) {
      console.error('[task-workflow-resilient] rerender', error);
    }
    try {
      const app = appState();
      if (app?.activeSku === task.articleKey && typeof window.renderSkuModal === 'function') {
        window.renderSkuModal(task.articleKey);
      }
    } catch {}
  }

  function appendHistory(task, kind, text) {
    const message = String(text || '').trim();
    const app = appState();
    if (!message || !app?.storage) return;
    app.storage.comments = Array.isArray(app.storage.comments) ? app.storage.comments : [];
    let team = 'Team';
    try {
      if (typeof window.teamMemberLabel === 'function') team = window.teamMemberLabel();
    } catch {}
    const comment = {
      id: makeId('comment'),
      articleKey: task.articleKey || '',
      author: app.team?.member?.name || task.owner || 'Team',
      team,
      type: 'task_log',
      text: `[[task:${task.id}]] [[kind:${kind || 'comment'}]] ${message}`,
      createdAt: new Date().toISOString()
    };
    app.storage.comments.unshift(comment);
    rememberPending('comment', comment);
    saveNow();
    schedulePersist('comment', comment);
  }

  async function transitionTask(taskId, status, entries) {
    const task = materializeTask(taskId);
    if (!task) return null;
    task.status = status;
    task.updatedAt = new Date().toISOString();
    task.updated_at = task.updatedAt;
    renderAfterTaskChange(task);
    (entries || []).forEach((entry) => appendHistory(task, entry.kind, entry.text));
    return task;
  }

  window.submitTaskForRopApproval = async function submitTaskForRopApprovalResilient(taskId, report) {
    const text = String(report || '').trim();
    if (!text) throw new Error('Report is required.');
    return transitionTask(taskId, 'waiting_rop', [{
      kind: 'report',
      text: `\u0418\u0441\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c \u0441\u0434\u0430\u043b \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0438 \u043f\u0435\u0440\u0435\u0434\u0430\u043b \u0437\u0430\u0434\u0430\u0447\u0443 \u0420\u041e\u041f\u0443 \u043d\u0430 \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043d\u0438\u0435: ${text}`
    }]);
  };

  window.approveTaskByRop = async function approveTaskByRopResilient(taskId, comment) {
    const note = String(comment || '').trim();
    return transitionTask(taskId, 'waiting_decision', [{
      kind: 'status',
      text: note
        ? `\u0420\u041e\u041f \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043b \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0438 \u043f\u0435\u0440\u0435\u0434\u0430\u043b \u0437\u0430\u0434\u0430\u0447\u0443 \u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044e: ${note}`
        : '\u0420\u041e\u041f \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043b \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0438 \u043f\u0435\u0440\u0435\u0434\u0430\u043b \u0437\u0430\u0434\u0430\u0447\u0443 \u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044e.'
    }]);
  };

  window.returnTaskToWork = async function returnTaskToWorkResilient(taskId, comment) {
    const note = String(comment || '').trim();
    return transitionTask(taskId, 'in_progress', [{
      kind: 'comment',
      text: note
        ? `\u0420\u041e\u041f \u0432\u0435\u0440\u043d\u0443\u043b \u0437\u0430\u0434\u0430\u0447\u0443 \u0432 \u0440\u0430\u0431\u043e\u0442\u0443: ${note}`
        : '\u0420\u041e\u041f \u0432\u0435\u0440\u043d\u0443\u043b \u0437\u0430\u0434\u0430\u0447\u0443 \u0432 \u0440\u0430\u0431\u043e\u0442\u0443.'
    }]);
  };

  window.finalCloseTaskWithReport = async function finalCloseTaskWithReportResilient(taskId, report) {
    const text = String(report || '').trim();
    if (!text) throw new Error('Report is required.');
    return transitionTask(taskId, 'done', [{
      kind: 'report',
      text: `\u0420\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c \u0444\u0438\u043d\u0430\u043b\u044c\u043d\u043e \u0437\u0430\u043a\u0440\u044b\u043b \u0437\u0430\u0434\u0430\u0447\u0443: ${text}`
    }]);
  };

  window.closeTaskWithReport = window.finalCloseTaskWithReport;

  function activeTaskId() {
    try {
      const app = appState();
      return String(app?.activeTaskId || '').trim();
    } catch {
      return '';
    }
  }

  function looksLikeRopSubmitForm(form) {
    if (!form || form.nodeType !== 1) return false;
    const id = String(form.id || '').trim();
    if (id === 'taskSubmitToRopForm') return true;
    if (id !== 'taskCloseForm') return false;
    const text = String(form.closest('.card')?.textContent || form.textContent || '');
    return text.includes('РОП') || /\bROP\b/i.test(text);
  }

  function formButton(form) {
    return form?.querySelector?.('button[type="submit"], input[type="submit"]') || null;
  }

  async function runGuardedFormSubmit(form, action) {
    if (!form || form.dataset.workflowResilientSending === '1') return;
    const taskId = activeTaskId();
    const data = new FormData(form);
    const report = String(data.get('report') || data.get('comment') || '').trim();
    if (!taskId) throw new Error('Task is not selected.');
    if ((action === 'submit' || action === 'final') && !report) {
      form.querySelector('textarea[name="report"]')?.focus();
      return;
    }

    const button = formButton(form);
    const initialText = button?.textContent || button?.value || '';
    form.dataset.workflowResilientSending = '1';
    if (button) {
      button.disabled = true;
      if ('value' in button && button.tagName === 'INPUT') button.value = 'Saving...';
      else button.textContent = 'Saving...';
    }
    try {
      let updated = null;
      if (action === 'submit') updated = await window.submitTaskForRopApproval(taskId, report);
      else if (action === 'approve') updated = await window.approveTaskByRop(taskId, report);
      else if (action === 'final') updated = await window.finalCloseTaskWithReport(taskId, report);
      if (!updated) throw new Error('Task state was not updated.');
      try {
        if (typeof window.renderTaskModal === 'function') window.renderTaskModal(taskId);
      } catch {}
    } finally {
      form.dataset.workflowResilientSending = '0';
      if (button && button.isConnected) {
        button.disabled = false;
        if ('value' in button && button.tagName === 'INPUT') button.value = initialText || 'Submit';
        else button.textContent = initialText || 'Submit';
      }
    }
  }

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    let action = '';
    if (looksLikeRopSubmitForm(form)) action = 'submit';
    else if (form.id === 'taskRopApproveForm') action = 'approve';
    else if (form.id === 'taskFinalCloseForm') action = 'final';
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    runGuardedFormSubmit(form, action).catch((error) => {
      console.error('[task-workflow-resilient] guarded submit', error);
      window.alert(error?.message || 'Task was saved locally, but the shared layer needs a retry.');
    });
  }, true);

  applyPendingWorkflow();
  flushPendingWorkflow();
  wrapPullRemoteState();
  window.setTimeout(wrapPullRemoteState, 1000);

  try { submitTaskForRopApproval = window.submitTaskForRopApproval; } catch {}
  try { approveTaskByRop = window.approveTaskByRop; } catch {}
  try { returnTaskToWork = window.returnTaskToWork; } catch {}
  try { finalCloseTaskWithReport = window.finalCloseTaskWithReport; } catch {}
  try { closeTaskWithReport = window.closeTaskWithReport; } catch {}
})();
