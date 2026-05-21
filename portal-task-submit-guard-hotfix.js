(function () {
  if (window.__ALTEA_TASK_SUBMIT_GUARD_20260521__) return;
  window.__ALTEA_TASK_SUBMIT_GUARD_20260521__ = true;

  const RECENT_DUPLICATE_MS = 120000;
  const PENDING_KEEP_MS = 5000;
  const FORM_TIMEOUT_MS = 45000;
  const GUARDED_FORM_SELECTOR = '#generalTaskForm, #manualTaskForm';
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
