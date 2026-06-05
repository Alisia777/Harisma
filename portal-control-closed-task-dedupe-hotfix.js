(function () {
  if (window.__ALTEA_CONTROL_CLOSED_TASK_DEDUPE_20260605__) return;
  window.__ALTEA_CONTROL_CLOSED_TASK_DEDUPE_20260605__ = true;

  const DEPRECATED_AUTO_SIGNAL_CODES = new Set([
    'kz_owner',
    'kz_economics',
    'kz_card',
    'kz_traffic',
    'low_stock'
  ]);

  function appState() {
    try {
      if (typeof state !== 'undefined') return state;
    } catch {}
    return window.state || null;
  }

  function parseTaskLog(comment) {
    try {
      if (typeof window.parseTaskLogComment === 'function') return window.parseTaskLogComment(comment);
    } catch {}
    const match = String(comment?.text || '').match(/^\[\[task:([^\]]+)\]\]\s*\[\[kind:([^\]]+)\]\]\s*([\s\S]*)/i);
    if (!match) return null;
    return {
      taskId: String(match[1] || '').trim(),
      kind: String(match[2] || '').trim(),
      text: String(match[3] || '').trim()
    };
  }

  function workflowIntent(textValue) {
    const text = String(textValue || '').trim().toLowerCase();
    if (!text) return '';
    if (
      text.includes('\u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c \u0444\u0438\u043d\u0430\u043b\u044c\u043d\u043e \u0437\u0430\u043a\u0440\u044b\u043b')
      || text.includes('\u0437\u0430\u0434\u0430\u0447\u0430 \u0437\u0430\u043a\u0440\u044b\u0442\u0430 \u0441 \u043e\u0442\u0447\u0451\u0442\u043e\u043c')
      || text.includes('\u0437\u0430\u0434\u0430\u0447\u0430 \u0437\u0430\u043a\u0440\u044b\u0442\u0430 \u0441 \u043e\u0442\u0447\u0435\u0442\u043e\u043c')
      || text.includes('\u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043e \u0438\u0437 \u043f\u0440\u043e\u0441\u0442\u043e\u0433\u043e \u044d\u043a\u0440\u0430\u043d\u0430')
    ) return 'done';
    if (text.includes('\u0440\u043e\u043f \u0432\u0435\u0440\u043d\u0443\u043b') && text.includes('\u0432 \u0440\u0430\u0431\u043e\u0442\u0443')) return 'in_progress';
    if (text.includes('\u0440\u043e\u043f \u0441\u043e\u0433\u043b\u0430\u0441\u043e\u0432\u0430\u043b') && text.includes('\u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044e')) return 'waiting_decision';
    if (text.includes('\u0438\u0441\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c \u0441\u0434\u0430\u043b') && text.includes('\u0440\u043e\u043f')) return 'waiting_rop';
    return '';
  }

  function closedTaskIdsFromHistory() {
    const app = appState();
    const comments = Array.isArray(app?.storage?.comments) ? app.storage.comments : [];
    const latest = new Map();
    comments.forEach((comment, index) => {
      const parsed = parseTaskLog(comment);
      if (!parsed?.taskId) return;
      const intent = workflowIntent(parsed.text);
      if (!intent) return;
      const parsedTime = Date.parse(comment?.createdAt || comment?.created_at || '');
      const weight = Number.isFinite(parsedTime) ? parsedTime : index;
      const previous = latest.get(parsed.taskId);
      if (!previous || weight >= previous.weight) latest.set(parsed.taskId, { intent, weight });
    });
    return new Set(
      [...latest.entries()]
        .filter(([, entry]) => entry.intent === 'done')
        .map(([taskId]) => String(taskId || '').trim())
        .filter(Boolean)
    );
  }

  function taskMeaningKey(task) {
    const article = String(task?.articleKey || task?.entityLabel || '').trim().toLowerCase();
    const meaning = String(task?.autoCode || task?.type || task?.title || '').trim().toLowerCase();
    const platform = String(task?.platform || '').trim().toLowerCase() || 'all';
    return `${article || 'common'}|${meaning || 'general'}|${platform}`;
  }

  function isDeprecatedAutoSignalTask(task = {}) {
    try {
      if (typeof window.isDeprecatedAutoSignalTask === 'function') return window.isDeprecatedAutoSignalTask(task);
    } catch {}
    const code = String(task?.autoCode || '').trim().toLowerCase();
    if (DEPRECATED_AUTO_SIGNAL_CODES.has(code)) return true;
    const id = String(task?.id || '').trim().toLowerCase();
    if (/^auto-kz[_-](owner|economics|card|traffic)/.test(id)) return true;
    if (/^auto-stock[_-]/.test(id) && (!code || code === 'low_stock')) return true;
    return false;
  }

  function shouldPreferTask(candidate, current) {
    if (!current) return true;
    const candidateManual = candidate?.source !== 'auto';
    const currentManual = current?.source !== 'auto';
    if (candidateManual !== currentManual) return candidateManual;
    const candidateRank = Number(window.PRIORITY_META?.[candidate?.priority]?.rank || 0);
    const currentRank = Number(window.PRIORITY_META?.[current?.priority]?.rank || 0);
    if (candidateRank !== currentRank) return candidateRank > currentRank;
    return String(candidate?.createdAt || '') > String(current?.createdAt || '');
  }

  function dedupeClosedAutoSignals(tasks) {
    const source = Array.isArray(tasks) ? tasks : [];
    const closedIds = closedTaskIdsFromHistory();
    const manualMeaningKeys = new Set(
      source
        .filter((task) => !isDeprecatedAutoSignalTask(task))
        .filter((task) => task?.status !== 'cancelled' && (
          task?.source !== 'auto'
          || task?.status === 'done'
          || closedIds.has(String(task?.id || '').trim())
        ))
        .map(taskMeaningKey)
    );
    const byKey = new Map();
    source.forEach((task) => {
      if (isDeprecatedAutoSignalTask(task)) return;
      const taskId = String(task?.id || '').trim();
      if (task?.source === 'auto' && (closedIds.has(taskId) || manualMeaningKeys.has(taskMeaningKey(task)))) return;
      const key = task?.source !== 'auto' ? `manual|${taskId || taskMeaningKey(task)}` : `auto|${taskMeaningKey(task)}`;
      if (shouldPreferTask(task, byKey.get(key))) byKey.set(key, task);
    });
    const result = [...byKey.values()];
    return typeof window.sortTasks === 'function' ? window.sortTasks(result) : result;
  }

  function install() {
    const original = window.getAllTasks || (typeof getAllTasks === 'function' ? getAllTasks : null);
    if (typeof original !== 'function' || original.__closedTaskDedupeHotfix) return false;
    const patched = function getAllTasksClosedTaskDedupeHotfix(...args) {
      return dedupeClosedAutoSignals(original.apply(this, args));
    };
    patched.__closedTaskDedupeHotfix = true;
    patched.__closedTaskDedupeOriginal = original;
    window.getAllTasks = patched;
    try { getAllTasks = patched; } catch {}
    try {
      if (typeof window.invalidateControlTaskCache === 'function') window.invalidateControlTaskCache();
    } catch {}
    return true;
  }

  function installEventually(attempt = 0) {
    if (install()) {
      window.setTimeout(() => {
        try {
          if (typeof window.rerenderCurrentView === 'function') window.rerenderCurrentView();
        } catch {}
      }, 80);
      return;
    }
    if (attempt < 20) window.setTimeout(() => installEventually(attempt + 1), 250);
  }

  window.__alteaClosedTaskDedupeHotfix = { install, closedTaskIdsFromHistory, dedupeClosedAutoSignals };
  installEventually();
})();
