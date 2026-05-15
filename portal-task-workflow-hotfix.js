(function () {
  if (window.__ALTEA_TASK_WORKFLOW_HOTFIX_20260515__) return;
  window.__ALTEA_TASK_WORKFLOW_HOTFIX_20260515__ = true;

  function currentTask(taskId) {
    const id = String(taskId || '').trim();
    if (!id) return null;
    if (typeof window.getTask === 'function') return window.getTask(id);
    if (typeof getTask === 'function') return getTask(id);
    if (typeof window.getAllTasks === 'function') return (window.getAllTasks() || []).find((task) => task?.id === id) || null;
    if (typeof getAllTasks === 'function') return (getAllTasks() || []).find((task) => task?.id === id) || null;
    return null;
  }

  async function appendHistory(taskId, kind, text, payload) {
    const message = String(text || '').trim();
    if (!message) return null;
    const task = currentTask(taskId);
    const author = payload?.author || task?.owner || state?.team?.member?.name || 'Команда';
    const team = payload?.team || (typeof teamMemberLabel === 'function' ? teamMemberLabel() : 'Команда');

    if (typeof window.createTaskHistoryEntry === 'function') {
      return window.createTaskHistoryEntry(taskId, kind || 'comment', message, { author, team });
    }
    if (typeof createTaskHistoryEntry === 'function') {
      return createTaskHistoryEntry(taskId, kind || 'comment', message, { author, team });
    }
    if (typeof createComment === 'function') {
      return createComment({
        articleKey: task?.articleKey || '',
        author,
        team,
        type: 'task_log',
        text: `[[task:${taskId}]] [[kind:${kind || 'comment'}]] ${message}`
      });
    }
    return null;
  }

  async function setTaskStatus(taskId, status, note, kind) {
    const updater = typeof window.updateTaskRecord === 'function'
      ? window.updateTaskRecord
      : (typeof updateTaskRecord === 'function' ? updateTaskRecord : null);
    if (typeof updater !== 'function') throw new Error('Механика обновления задачи не загружена.');
    const updated = await updater(taskId, { status });
    if (!updated) throw new Error('Задача не найдена или не была сохранена.');
    if (note) await appendHistory(updated.id || taskId, kind || 'status', note);
    return updated;
  }

  async function submitTaskForRopApproval(taskId, report) {
    const text = String(report || '').trim();
    if (!text) throw new Error('Нужен короткий отчет по задаче.');
    return setTaskStatus(
      taskId,
      'waiting_rop',
      `Исполнитель сдал результат и передал задачу РОПу на согласование: ${text}`,
      'report'
    );
  }

  async function approveTaskByRop(taskId, comment) {
    const note = String(comment || '').trim();
    return setTaskStatus(
      taskId,
      'waiting_decision',
      note
        ? `РОП согласовал результат и передал задачу руководителю: ${note}`
        : 'РОП согласовал результат и передал задачу руководителю на финальное закрытие.',
      'status'
    );
  }

  async function returnTaskToWork(taskId, comment) {
    const note = String(comment || '').trim();
    return setTaskStatus(
      taskId,
      'in_progress',
      note ? `РОП вернул задачу в работу: ${note}` : 'РОП вернул задачу в работу.',
      'comment'
    );
  }

  async function finalCloseTaskWithReport(taskId, report) {
    const text = String(report || '').trim();
    if (!text) throw new Error('Нужен финальный комментарий руководителя.');
    return setTaskStatus(
      taskId,
      'done',
      `Руководитель финально закрыл задачу: ${text}`,
      'report'
    );
  }

  window.appendTaskHistorySafe = appendHistory;
  window.submitTaskForRopApproval = submitTaskForRopApproval;
  window.approveTaskByRop = approveTaskByRop;
  window.returnTaskToWork = returnTaskToWork;
  window.finalCloseTaskWithReport = finalCloseTaskWithReport;
  window.closeTaskWithReport = finalCloseTaskWithReport;

  try { appendTaskHistorySafe = window.appendTaskHistorySafe; } catch {}
  try { submitTaskForRopApproval = window.submitTaskForRopApproval; } catch {}
  try { approveTaskByRop = window.approveTaskByRop; } catch {}
  try { returnTaskToWork = window.returnTaskToWork; } catch {}
  try { finalCloseTaskWithReport = window.finalCloseTaskWithReport; } catch {}
  try { closeTaskWithReport = window.closeTaskWithReport; } catch {}
})();
