(() => {
  'use strict';

  if (window.__ALTEA_SKU_DECISION_RUNTIME__) return;
  window.__ALTEA_SKU_DECISION_RUNTIME__ = '20260727-demand-price-approval-4';

  function persistLifecycleControlsSafely() {
    try {
      if (typeof persistRepricerControls === 'function') {
        Promise.resolve(persistRepricerControls()).catch((error) => console.error('[sku-decision.lifecycle.persist]', error));
      }
    } catch (error) {
      console.error('[sku-decision.lifecycle.persist]', error);
    }
  }

  window.upsertProductLifecycleStatus = async function upsertProductLifecycleStatusWithRepricerPersistence(payload = {}) {
    const override = normalizeProductLifecycleOverride({
      articleKey: payload.articleKey,
      status: payload.status,
      key: payload.key,
      note: payload.note,
      updatedAt: new Date().toISOString(),
      updatedBy: state.team?.member?.name || 'Команда'
    });
    if (!override.articleKey) return null;

    const previous = productLifecycleOverrideForArticle(override.articleKey);
    state.storage.productLifecycleOverrides = (state.storage.productLifecycleOverrides || [])
      .filter((item) => item.articleKey !== override.articleKey);
    state.storage.productLifecycleOverrideDeletes = (state.storage.productLifecycleOverrideDeletes || [])
      .filter((item) => item.articleKey !== override.articleKey);
    state.storage.productLifecycleOverrides.unshift(override);
    applyOwnerOverridesToSkus();
    if (typeof invalidateRepricerRowsCache === 'function') invalidateRepricerRowsCache();
    saveLocalStorage();
    persistLifecycleControlsSafely();

    const changed = !previous || previous.key !== override.key || String(previous.note || '') !== override.note;
    if (changed) {
      try {
        Promise.resolve(createComment({
          articleKey: override.articleKey,
          author: state.team?.member?.name || 'Команда',
          team: teamMemberLabel(),
          type: productLifecycleIsExit(override.key) ? 'risk' : 'signal',
          text: `Статус товара: ${override.status}${override.note ? `. ${override.note}` : ''}`
        })).catch((error) => console.error('[sku-decision.lifecycle.comment]', error));
      } catch (error) {
        console.error('[sku-decision.lifecycle.comment]', error);
      }
    }
    return override;
  };

  window.removeProductLifecycleStatus = async function removeProductLifecycleStatusWithRepricerPersistence(articleKey = '') {
    const normalizedArticleKey = String(articleKey || '').trim();
    if (!normalizedArticleKey) return null;
    const previous = productLifecycleOverrideForArticle(normalizedArticleKey);
    state.storage.productLifecycleOverrides = (state.storage.productLifecycleOverrides || [])
      .filter((item) => item.articleKey !== normalizedArticleKey);
    const deleteMarker = normalizeRepricerDeleteTombstone({
      articleKey: normalizedArticleKey,
      platform: 'all',
      deletedAt: new Date().toISOString(),
      updatedBy: state.team?.member?.name || 'Команда'
    });
    state.storage.productLifecycleOverrideDeletes = (state.storage.productLifecycleOverrideDeletes || [])
      .filter((item) => item.articleKey !== normalizedArticleKey);
    state.storage.productLifecycleOverrideDeletes.unshift(deleteMarker);
    applyOwnerOverridesToSkus();
    if (typeof invalidateRepricerRowsCache === 'function') invalidateRepricerRowsCache();
    saveLocalStorage();
    persistLifecycleControlsSafely();
    if (previous) {
      try {
        Promise.resolve(createComment({
          articleKey: normalizedArticleKey,
          author: state.team?.member?.name || 'Команда',
          team: teamMemberLabel(),
          type: 'signal',
          text: `Ручной статус товара снят. Было: ${previous.status}.`
        })).catch((error) => console.error('[sku-decision.lifecycle.comment]', error));
      } catch (error) {
        console.error('[sku-decision.lifecycle.comment]', error);
      }
    }
    return deleteMarker;
  };
const SKU_DECISION_TYPES = new Set(['PRODUCT_STATUS_CHANGE', 'SHARP_PRICE_CHANGE', 'DEMAND_PRICE_REVIEW']);
const SKU_DECISION_PENDING_STATUSES = new Set(['preparing', 'waiting_rop', 'changes_requested']);
const SKU_DECISION_REQUESTS_IN_FLIGHT = new Map();

function normalizeSkuDecisionApproval(item = {}) {
  const type = String(item.type || item.decisionType || '').trim().toUpperCase();
  const articleKey = String(item.articleKey || item.article || item.sku || '').trim();
  const platform = String(item.platform || 'all').trim().toLowerCase() || 'all';
  const createdAt = String(item.createdAt || item.requestedAt || '').trim() || new Date().toISOString();
  return {
    ...item,
    id: String(item.id || stableId('sku-decision', `${type}|${articleKey}|${platform}|${createdAt}`)).trim(),
    type: SKU_DECISION_TYPES.has(type) ? type : 'PRODUCT_STATUS_CHANGE',
    articleKey,
    platform,
    status: String(item.status || 'waiting_rop').trim().toLowerCase() || 'waiting_rop',
    reason: String(item.reason || item.note || '').trim(),
    requestedBy: String(item.requestedBy || item.author || '').trim() || state.team?.member?.name || 'Команда',
    requestedRole: String(item.requestedRole || item.role || '').trim() || state.team?.member?.role || 'Команда',
    createdAt,
    updatedAt: String(item.updatedAt || createdAt).trim() || createdAt,
    taskId: String(item.taskId || '').trim(),
    currentValue: item.currentValue ?? '',
    proposedValue: item.proposedValue ?? '',
    payload: item.payload && typeof item.payload === 'object' ? item.payload : {},
    metrics: item.metrics && typeof item.metrics === 'object' ? item.metrics : {}
  };
}

function skuDecisionSessionCache() {
  window.__alteaSkuDecisionSessionCache = Array.isArray(window.__alteaSkuDecisionSessionCache)
    ? window.__alteaSkuDecisionSessionCache
    : [];
  return window.__alteaSkuDecisionSessionCache;
}

function rememberSkuDecisionInSession(item = {}) {
  const normalized = normalizeSkuDecisionApproval(item);
  if (!normalized.id || !normalized.articleKey) return null;
  window.__alteaSkuDecisionSessionCache = [
    normalized,
    ...skuDecisionSessionCache().filter((row) => String(row?.id || '') !== normalized.id)
  ].slice(0, 100);
  return normalized;
}

function skuDecisionApprovals() {
  state.storage = state.storage || {};
  const persisted = (Array.isArray(state.storage.skuDecisionApprovals)
    ? state.storage.skuDecisionApprovals
    : [])
    .map(normalizeSkuDecisionApproval)
    .filter((item) => item.id && item.articleKey);
  const merged = new Map(persisted.map((item) => [item.id, item]));
  skuDecisionSessionCache()
    .map(normalizeSkuDecisionApproval)
    .filter((item) => item.id && item.articleKey)
    .forEach((item) => merged.set(item.id, item));
  state.storage.skuDecisionApprovals = [...merged.values()]
    .sort((left, right) => String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || '')))
    .slice(0, 1000);
  return state.storage.skuDecisionApprovals;
}

function skuDecisionForTask(taskId = '') {
  const wanted = String(taskId || '').trim();
  if (!wanted) return null;
  return skuDecisionApprovals().find((item) => item.taskId === wanted) || null;
}

function skuDecisionPendingForArticle(articleKey = '', type = '', platform = 'all') {
  const wantedArticle = String(articleKey || '').trim();
  const wantedType = String(type || '').trim().toUpperCase();
  const wantedPlatform = String(platform || 'all').trim().toLowerCase() || 'all';
  return skuDecisionApprovals().find((item) => (
    item.articleKey === wantedArticle
    && (!wantedType || item.type === wantedType)
    && (wantedPlatform === 'all' || item.platform === wantedPlatform || item.platform === 'all')
    && SKU_DECISION_PENDING_STATUSES.has(item.status)
  )) || null;
}

function skuDecisionTargetSignature(item = {}) {
  const payload = item.payload && typeof item.payload === 'object' ? item.payload : {};
  if (item.type === 'PRODUCT_STATUS_CHANGE') {
    return `${item.type}|${item.articleKey}|${payload.proposedStatusKey || item.proposedValue || ''}`;
  }
  return `${item.type}|${item.articleKey}|${item.platform}|${payload.requestedPrice || item.proposedValue || ''}`;
}

function skuDecisionPersist(decision = null) {
  if (decision) rememberSkuDecisionInSession(decision);
  skuDecisionApprovals();
  saveLocalStorage();
  try {
    if (typeof persistRepricerControls === 'function') {
      Promise.resolve(persistRepricerControls()).catch((error) => console.error(error));
    }
  } catch (error) {
    console.error(error);
  }
}

function skuDecisionTaskCopy(decision = {}) {
  if (decision.type === 'DEMAND_PRICE_REVIEW') {
    const turnoverDays = Number(decision.payload?.demandIntelligence?.current_turnover_days);
    const targetDays = Number(decision.payload?.demandIntelligence?.target_turnover_days);
    const approvalTtlHours = Math.max(1, Number(decision.payload?.approvalTtlHours) || 72);
    const turnoverLabel = Number.isFinite(turnoverDays) && Number.isFinite(targetDays)
      ? ` Оборачиваемость ${Math.round(turnoverDays * 10) / 10} дн. при цели ${Math.round(targetDays * 10) / 10} дн.`
      : '';
    return {
      title: `Согласовать умную цену · ${decision.articleKey}`,
      entityLabel: `${decision.articleKey} · ${String(decision.platform || 'all').toUpperCase()}`,
      type: 'price_margin',
      priority: 'high',
      nextAction: `РОП проверяет цену ${decision.currentValue || '—'} → ${decision.proposedValue || '—'} ₽.${turnoverLabel} До подтверждения цена не меняется; решение действует ${approvalTtlHours} ч., затем SKU пересчитывается заново.`
    };
  }
  if (decision.type === 'SHARP_PRICE_CHANGE') {
    const deltaPct = Number(decision.payload?.deltaPct);
    const deltaLabel = Number.isFinite(deltaPct) ? ` (${deltaPct > 0 ? '+' : ''}${Math.round(deltaPct * 1000) / 10}%)` : '';
    return {
      title: `Согласовать резкое изменение цены · ${decision.articleKey}`,
      entityLabel: `${decision.articleKey} · ${String(decision.platform || 'all').toUpperCase()}`,
      type: 'price_margin',
      priority: 'critical',
      nextAction: `РОП подтверждает цену ${decision.currentValue || '—'} → ${decision.proposedValue || '—'} ₽${deltaLabel}. До подтверждения цена не меняется.`
    };
  }
  return {
    title: `Согласовать статус товара · ${decision.articleKey}`,
    entityLabel: `${decision.articleKey} · ${decision.currentValue || '—'} → ${decision.proposedValue || '—'}`,
    type: 'general',
    priority: 'high',
    nextAction: `РОП подтверждает смену статуса «${decision.currentValue || '—'}» → «${decision.proposedValue || '—'}». До подтверждения статус не меняется.`
  };
}

async function createSkuDecisionTask(decision) {
  const copy = skuDecisionTaskCopy(decision);
  const now = new Date().toISOString();
  const task = normalizeTask({
    id: uid('task'),
    source: decision.payload?.autoGenerated ? 'auto' : 'manual',
    articleKey: decision.articleKey,
    entityLabel: copy.entityLabel,
    title: copy.title,
    type: copy.type,
    priority: copy.priority,
    platform: decision.platform || 'all',
    due: plusDays(1),
    status: 'waiting_rop',
    nextAction: copy.nextAction,
    reason: `[[sku-decision:${decision.id}]] ${decision.reason}`,
    createdAt: now,
    updatedAt: now
  }, 'manual');
  state.storage.tasks = Array.isArray(state.storage.tasks) ? state.storage.tasks : [];
  state.storage.tasks.unshift(task);
  saveLocalStorage();
  try {
    if (typeof persistTask === 'function') {
      Promise.resolve(persistTask(task)).catch((error) => console.error(error));
    }
    if (typeof createTaskHistoryEntry === 'function') {
      Promise.resolve(createTaskHistoryEntry(
        task.id,
        'created',
        `Автозадача РОПу создана ${decision.payload?.autoGenerated ? 'репрайсером' : 'из SKU Workspace'}. ${copy.nextAction} Основание: ${decision.reason}`
      )).catch((error) => console.error(error));
    }
  } catch (error) {
    console.error(error);
  }
  return task;
}

async function requestSkuDecisionApproval(payload = {}) {
  const requestedDecision = normalizeSkuDecisionApproval({
    ...payload,
    status: 'preparing',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  if (!requestedDecision.articleKey) throw new Error('Не указан articleKey для согласования.');
  if (!requestedDecision.reason) throw new Error('Для согласования нужно краткое основание.');
  const signature = skuDecisionTargetSignature(requestedDecision);
  const inFlight = SKU_DECISION_REQUESTS_IN_FLIGHT.get(signature);
  if (inFlight) return { ...(await inFlight), duplicate: true };

  const operation = (async () => {
    const existing = skuDecisionApprovals().find((item) => (
      SKU_DECISION_PENDING_STATUSES.has(item.status)
      && skuDecisionTargetSignature(item) === signature
    ));
    if (existing && existing.status !== 'preparing') return { ...existing, duplicate: true };
    if (existing?.taskId) {
      existing.status = 'waiting_rop';
      existing.updatedAt = new Date().toISOString();
      skuDecisionPersist(existing);
      return { ...existing, duplicate: true };
    }

    const decision = existing || requestedDecision;
    if (!existing) state.storage.skuDecisionApprovals.unshift(decision);
    skuDecisionPersist(decision);
    try {
      const task = await createSkuDecisionTask(decision);
      decision.taskId = String(task?.id || '').trim();
      decision.status = 'waiting_rop';
      decision.updatedAt = new Date().toISOString();
      skuDecisionPersist(decision);
      window.dispatchEvent(new CustomEvent('altea:sku-decision-updated', { detail: { decisionId: decision.id, status: decision.status } }));
      return decision;
    } catch (error) {
      decision.status = 'error';
      decision.error = String(error?.message || error || 'Не удалось создать задачу РОПу');
      decision.updatedAt = new Date().toISOString();
      skuDecisionPersist(decision);
      throw error;
    }
  })();
  SKU_DECISION_REQUESTS_IN_FLIGHT.set(signature, operation);
  try {
    return await operation;
  } finally {
    if (SKU_DECISION_REQUESTS_IN_FLIGHT.get(signature) === operation) {
      SKU_DECISION_REQUESTS_IN_FLIGHT.delete(signature);
    }
  }
}

async function applySkuDecisionApproval(decision, comment = '') {
  const approvedAt = new Date().toISOString();
  const approvedBy = state.team?.member?.name || 'РОП';
  const approvedRole = state.team?.member?.role || 'РОП';
  if (decision.type === 'PRODUCT_STATUS_CHANGE') {
    if (decision.payload?.clearOverride) {
      await window.removeProductLifecycleStatus(decision.articleKey);
    } else {
      const key = String(decision.payload?.proposedStatusKey || decision.proposedValue || '').trim();
      const meta = productLifecycleMeta(key);
      await window.upsertProductLifecycleStatus({
        articleKey: decision.articleKey,
        key: meta.key,
        status: meta.label,
        note: [decision.reason, comment ? `РОП: ${comment}` : '', `Согласовано ${approvedBy}`].filter(Boolean).join(' · ')
      });
    }
  } else if (['SHARP_PRICE_CHANGE', 'DEMAND_PRICE_REVIEW'].includes(decision.type)) {
    const rawOverride = decision.payload?.override && typeof decision.payload.override === 'object'
      ? decision.payload.override
      : {};
    const demandApprovalTtlHours = decision.type === 'DEMAND_PRICE_REVIEW'
      ? Math.max(1, Number(decision.payload?.approvalTtlHours) || 72)
      : null;
    const expiresAt = demandApprovalTtlHours === null
      ? String(rawOverride.expiresAt || rawOverride.expires_at || '').trim()
      : new Date(Date.parse(approvedAt) + demandApprovalTtlHours * 60 * 60 * 1000).toISOString();
    const sourceChecksum = stableId('approval', `${decision.id}|${decision.articleKey}|${decision.platform}|${decision.proposedValue}`);
    const approvedOverride = normalizeRepricerOverride({
      ...rawOverride,
      articleKey: decision.articleKey,
      platform: decision.platform,
      updatedAt: approvedAt,
      updatedBy: approvedBy,
      approvalStatus: 'approved',
      sourceStore: 'portal_task_approval',
      author: decision.requestedBy,
      role: decision.requestedRole,
      reason: decision.reason,
      createdAt: decision.createdAt,
      approvedBy,
      approvedAt,
      expiresAt,
      batchId: decision.id,
      sourceFile: `portal-task:${decision.taskId}`,
      sourceChecksum
    });
    if (typeof upsertRepricerOverride !== 'function') throw new Error('Модуль репрайсера не готов применить подтверждённую цену.');
    upsertRepricerOverride(approvedOverride);
  } else {
    throw new Error(`Неизвестный тип решения: ${decision.type}`);
  }

  Object.assign(decision, {
    status: 'applied',
    approvalStatus: 'approved',
    approvedBy,
    approvedRole,
    approvedAt,
    appliedAt: approvedAt,
    approvalComment: String(comment || '').trim(),
    updatedAt: approvedAt
  });
  skuDecisionPersist(decision);
  window.dispatchEvent(new CustomEvent('altea:sku-decision-updated', { detail: { decisionId: decision.id, status: decision.status } }));
  return decision;
}

async function approveSkuDecisionForTask(taskId = '', comment = '') {
  const decision = skuDecisionForTask(taskId);
  if (!decision) return null;
  if (decision.status === 'applied') return decision;
  return applySkuDecisionApproval(decision, comment);
}

function markSkuDecisionChangesRequested(taskId = '', comment = '') {
  const decision = skuDecisionForTask(taskId);
  if (!decision || decision.status === 'applied') return decision;
  decision.status = 'changes_requested';
  decision.returnComment = String(comment || '').trim();
  decision.returnedAt = new Date().toISOString();
  decision.updatedAt = decision.returnedAt;
  skuDecisionPersist(decision);
  window.dispatchEvent(new CustomEvent('altea:sku-decision-updated', { detail: { decisionId: decision.id, status: decision.status } }));
  return decision;
}

function markSkuDecisionWaitingRop(taskId = '') {
  const decision = skuDecisionForTask(taskId);
  if (!decision || decision.status === 'applied') return decision;
  decision.status = 'waiting_rop';
  decision.updatedAt = new Date().toISOString();
  skuDecisionPersist(decision);
  window.dispatchEvent(new CustomEvent('altea:sku-decision-updated', { detail: { decisionId: decision.id, status: decision.status } }));
  return decision;
}

window.normalizeSkuDecisionApproval = normalizeSkuDecisionApproval;
window.skuDecisionApprovals = skuDecisionApprovals;
window.skuDecisionForTask = skuDecisionForTask;
window.skuDecisionPendingForArticle = skuDecisionPendingForArticle;
window.requestSkuDecisionApproval = requestSkuDecisionApproval;
window.approveSkuDecisionForTask = approveSkuDecisionForTask;
window.markSkuDecisionChangesRequested = markSkuDecisionChangesRequested;
window.markSkuDecisionWaitingRop = markSkuDecisionWaitingRop;
setTimeout(() => {
  if (typeof window.syncRepricerAutomaticSharpPriceApprovals !== 'function' || typeof window.buildRepricerRows !== 'function') return;
  window.syncRepricerAutomaticSharpPriceApprovals(window.buildRepricerRows())
    .catch((error) => console.error('[sku-decision.auto-repricer]', error));
}, 0);


  window.__ALTEA_SKU_DECISION_RUNTIME_READY__ = true;
})();
