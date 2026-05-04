function renderSkuModal(articleKey) {
  const sku = getSku(articleKey);
  if (!sku) return;
  state.activeSku = articleKey;

  const body = document.getElementById('skuModalBody');
  const modal = document.getElementById('skuModal');
  const comments = getSkuComments(articleKey);
  const decisions = getSkuDecisions(articleKey);
  const tasks = getSkuControlTasks(articleKey);
  const activeTask = nextTaskForSku(articleKey);
  const owners = ownerOptions();
  const completion = currentCompletionSnapshot(sku);
  const currentPlanUnits = firstFiniteValue(sku?.planFact?.planApr26Units);
  const currentFactUnits = firstFiniteValue(
    sku?.planFact?.factApr16Units,
    sku?.planFact?.factAprToDateUnits
  );
  const resultRows = [
    currentPlanUnits !== null
      ? metricRow('План Apr 26', fmt.int(currentPlanUnits))
      : metricRow('План Feb 26', fmt.int(sku.planFact?.planFeb26Units)),
    currentFactUnits !== null
      ? metricRow('Факт Apr to date', fmt.int(currentFactUnits))
      : metricRow('Факт Feb 26', fmt.int(sku.planFact?.factFeb26Units))
  ];

  if (completion.monthPct !== null) {
    resultRows.push(metricRow('Выполнение месяца', fmt.pct(completion.monthPct), completion.monthPct < 0.8 ? 'danger-text' : ''));
  } else if (completion.legacyPct !== null) {
    resultRows.push(metricRow('Выполнение Feb 26', fmt.pct(completion.legacyPct), completion.legacyPct < 0.8 ? 'danger-text' : ''));
  }

  if (completion.toDatePct !== null) {
    resultRows.push(metricRow('К плану на дату', fmt.pct(completion.toDatePct), completion.toDatePct < 0.85 ? 'warn-text' : ''));
  }

  const modalMarkup = `
    <div class="modal-head">
      <div>
        <div class="muted small">${escapeHtml(sku.brand || 'Алтея')} · ${escapeHtml(sku.segment || sku.category || '—')}</div>
        <h2>${escapeHtml(sku.name || 'Без названия')}</h2>
        <div class="badge-stack">${linkToSku(sku.articleKey, sku.article || sku.articleKey)}${skuOperationalStatus(sku)}${scoreChip(sku.focusScore || 0)}${trafficBadges(sku, 'нет')}</div>
      </div>
      <button class="btn ghost" data-close-modal>Закрыть</button>
    </div>

    <div class="kv-3">
      <div class="card subtle">
        <h3>Результат</h3>
        ${resultRows.join('')}
        ${metricRow('WB маржа', fmt.pct(sku.wb?.marginPct), (sku.wb?.marginPct || 0) < 0 ? 'danger-text' : '')}
        ${metricRow('Ozon маржа', fmt.pct(sku.ozon?.marginPct), (sku.ozon?.marginPct || 0) < 0 ? 'danger-text' : '')}
      </div>
      <div class="card subtle">
        <h3>Почему в фокусе</h3>
        ${metricRow('Owner', escapeHtml(ownerName(sku) || 'Не закреплён'))}
        ${metricRow('WB остаток', fmt.int(sku.wb?.stock), (sku.wb?.stock || 0) <= 50 ? 'warn-text' : '')}
        ${metricRow('Ozon остаток', fmt.int(sku.ozon?.stock), (sku.ozon?.stock || 0) <= 50 ? 'warn-text' : '')}
        ${metricRow('Возвраты WB', fmt.pct(sku.returns?.wbPct), (sku.returns?.wbPct || 0) >= 0.05 ? 'warn-text' : '')}
        ${metricRow('Возвраты Ozon', fmt.pct(sku.returns?.ozonPct), (sku.returns?.ozonPct || 0) >= 0.05 ? 'warn-text' : '')}
        <div class="note-box">${escapeHtml(sku.focusReasons || 'Нет явной причины в текущем срезе.')}</div>
      </div>
      <div class="card subtle">
        <h3>Что делаем</h3>
        <div class="badge-stack">${activeTask ? taskPriorityBadge(activeTask) : ''}${activeTask ? taskStatusBadge(activeTask) : ''}${activeTask ? taskTypeBadge(activeTask) : ''}</div>
        <div class="note-box">${escapeHtml(activeTask?.nextAction || 'Активной задачи пока нет.')}</div>
        <div class="metric-row"><span>Следующий срок</span><strong>${escapeHtml(activeTask?.due || '—')}</strong></div>
        <div class="metric-row"><span>Внешний трафик</span><strong>${sku?.flags?.hasExternalTraffic ? 'Есть' : 'Нет'}</strong></div>
      </div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <h3>Задачи по SKU</h3>
        <div class="list">${tasks.length ? tasks.map(renderTaskCard).join('') : '<div class="empty">По этому SKU задач ещё нет</div>'}</div>
      </div>
      <div class="card">
        <h3>Добавить задачу</h3>
        <form id="manualTaskForm" class="form-grid compact">
          <input type="hidden" name="articleKey" value="${escapeHtml(articleKey)}">
          <input name="title" placeholder="Что делаем" required>
          <select name="type">${Object.entries(TASK_TYPE_META).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('')}</select>
          <select name="priority">${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}">${escapeHtml(meta.label)}</option>`).join('')}</select>
          <select name="platform">
            <option value="cross">Общий контур</option>
            <option value="wb">РОП WB</option>
            <option value="ozon">РОП Ozon</option>
            <option value="retail">ЯМ / Летуаль / Магнит / ЗЯ</option>
          </select>
          <input name="owner" placeholder="Owner" value="${escapeHtml(ownerName(sku) || '')}">
          <input name="due" type="date" value="${plusDays(3)}">
          <textarea name="nextAction" rows="3" placeholder="Следующее действие и что считаем результатом"></textarea>
          <button class="btn primary" type="submit">Добавить задачу</button>
        </form>
      </div>
    </div>

    <div class="modal-grid-3">
      <div class="card">
        <div class="modal-section-title">
          <div>
            <h3>Owner и зона ответственности</h3>
            <p class="small muted">Закрепление по SKU и короткая пометка, если owner меняется.</p>
          </div>
          <span class="owner-badge">${escapeHtml(ownerName(sku) || 'Не закреплён')}</span>
        </div>
        <datalist id="skuOwnerList">${owners.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
        <form id="ownerForm" class="form-grid compact">
          <input name="ownerName" list="skuOwnerList" placeholder="Кто owner" value="${escapeHtml(ownerName(sku) || '')}">
          <input name="ownerRole" placeholder="Роль / зона" value="${escapeHtml(sku?.owner?.registryStatus || 'Owner SKU')}">
          <textarea name="note" rows="3" placeholder="Что важно по закреплению / передаче SKU"></textarea>
          <div class="quick-actions">
            <button class="btn" type="submit">Сохранить owner</button>
            <button class="btn ghost" type="button" id="clearOwnerBtn">Снять owner</button>
          </div>
        </form>
        <div class="team-note">Командный режим: ${escapeHtml(state.team.note || 'Локальный режим')}</div>
      </div>
      <div class="card">
        <div class="modal-section-title">
          <div>
            <h3>Журнал решений</h3>
            <p class="small muted">То, что уже согласовали или ждёт подтверждения руководителя.</p>
          </div>
          ${badge(`${fmt.int(decisions.length)} записей`, decisions.length ? 'info' : '')}
        </div>
        <div class="small-stack">${decisions.length ? decisions.map((item) => `
          <div class="decision-item">
            <div class="head">
              <strong>${escapeHtml(item.title)}</strong>
              <div class="badge-stack">${taskStatusBadge(item)}${item.owner ? badge(item.owner, 'info') : ''}</div>
            </div>
            <div class="muted small">${escapeHtml(item.decision || 'Решение не заполнено')}</div>
            <div class="meta-line" style="margin-top:8px"><span class="muted small">Срок ${escapeHtml(item.due || '—')}</span><span class="muted small">${escapeHtml(item.createdBy || 'Команда')}</span></div>
          </div>
        `).join('') : '<div class="empty">Решений пока нет</div>'}</div>
      </div>
      <div class="card">
        <div class="modal-section-title">
          <div>
            <h3>Добавить решение</h3>
            <p class="small muted">Фиксируем не обсуждение, а итог: что решили, кто owner, какой срок.</p>
          </div>
        </div>
        <form id="decisionForm" class="form-grid compact">
          <input name="title" placeholder="Короткий заголовок решения" required>
          <input name="owner" placeholder="Кто ведёт решение" value="${escapeHtml(ownerName(sku) || '')}">
          <select name="status">${Object.entries(TASK_STATUS_META).map(([value, meta]) => `<option value="${value}" ${value === 'waiting_decision' ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
          <input name="due" type="date" value="${plusDays(3)}">
          <textarea name="decision" rows="4" placeholder="Что именно решили / что ещё нужно подтвердить" required></textarea>
          <button class="btn" type="submit">Сохранить решение</button>
        </form>
      </div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <h3>Комментарии и апдейты</h3>
        <div class="list">${comments.length ? comments.map((comment) => `
          <div class="comment-item">
            <div class="head"><strong>${escapeHtml(comment.author || 'Команда')}</strong><div class="badge-stack">${commentTypeChip(comment.type)}${badge(comment.team || 'Команда')}</div></div>
            <div class="muted small">${fmt.date(comment.createdAt)}</div>
            <p>${escapeHtml(comment.text)}</p>
          </div>
        `).join('') : '<div class="empty">Комментариев пока нет</div>'}</div>
      </div>
      <div class="card">
        <h3>Добавить апдейт</h3>
        <form id="commentForm" class="form-grid compact">
          <input type="hidden" name="articleKey" value="${escapeHtml(articleKey)}">
          <input name="author" placeholder="Кто пишет" value="${escapeHtml(state.team.member.name || ownerName(sku) || 'Команда')}" required>
          <select name="type">
            <option value="signal">Сигнал</option>
            <option value="risk">Риск</option>
            <option value="focus">Фокус</option>
            <option value="idea">Идея</option>
          </select>
          <textarea name="text" rows="5" placeholder="Коротко: что случилось, что делаем, что нужно от других…" required></textarea>
          <button class="btn" type="submit">Сохранить апдейт</button>
        </form>
      </div>
    </div>
  `;
  body.innerHTML = safeUiMarkup(modalMarkup);

  modal.classList.add('open');

  body.querySelector('#manualTaskForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createManualTask({
      articleKey,
      title: form.get('title'),
      type: form.get('type'),
      priority: form.get('priority'),
      platform: form.get('platform'),
      owner: form.get('owner'),
      due: form.get('due'),
      nextAction: form.get('nextAction')
    });
    renderSkuModal(articleKey);
    rerenderCurrentView();
  });

  body.querySelector('#ownerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await upsertOwnerAssignment({
      articleKey,
      ownerName: form.get('ownerName'),
      ownerRole: form.get('ownerRole'),
      note: form.get('note')
    });
    renderSkuModal(articleKey);
    rerenderCurrentView();
  });

  body.querySelector('#clearOwnerBtn')?.addEventListener('click', async () => {
    await removeOwnerAssignment(articleKey);
    renderSkuModal(articleKey);
    rerenderCurrentView();
  });

  body.querySelector('#decisionForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createDecision({
      articleKey,
      title: form.get('title'),
      decision: form.get('decision'),
      owner: form.get('owner'),
      status: form.get('status'),
      due: form.get('due')
    });
    renderSkuModal(articleKey);
    rerenderCurrentView();
  });

  body.querySelector('#commentForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createComment({
      articleKey,
      author: form.get('author'),
      team: teamMemberLabel(),
      type: form.get('type'),
      text: form.get('text')
    });
    renderSkuModal(articleKey);
  });
}

function deriveLaunchStatus(sku) {
  if (!ownerName(sku)) return 'Нужен owner';
  if (sku?.flags?.negativeMargin || sku?.flags?.toWork) return 'Нужно проверить экономику';
  if (totalSkuStock(sku) <= 0) return 'Ждём поставку';
  if (!sku?.flags?.hasExternalTraffic) return 'Готовим карточку и трафик';
  return 'В работе';
}

function deriveLaunchPhase(sku) {
  if (!ownerName(sku)) return 'owner';
  if (totalSkuStock(sku) <= 0) return 'supply';
  if (!sku?.flags?.hasExternalTraffic) return 'content';
  if (sku?.flags?.negativeMargin || sku?.flags?.toWork) return 'economy';
  return 'scale';
}

function launchPhaseMeta(phase) {
  const map = {
    owner: { label: 'Owner / ответственный', tone: 'warn' },
    supply: { label: 'Производство / поставка', tone: 'warn' },
    content: { label: 'Карточка / контент', tone: 'info' },
    economy: { label: 'Цена / экономика', tone: 'danger' },
    scale: { label: 'Запуск / масштабирование', tone: 'ok' }
  };
  return map[phase] || map.content;
}

function normalizeLaunchMonthLabel(value) {
  const label = String(value || '').trim();
  return label || 'Без месяца';
}

function launchMonthDateKey(label = '') {
  const match = String(label || '').trim().toLowerCase().match(/^([а-яё]+)\s+(\d{4})$/i);
  if (!match) return '';
  const monthMap = {
    январь: '01',
    февраль: '02',
    март: '03',
    апрель: '04',
    май: '05',
    июнь: '06',
    июль: '07',
    август: '08',
    сентябрь: '09',
    октябрь: '10',
    ноябрь: '11',
    декабрь: '12'
  };
  const month = monthMap[match[1]];
  return month ? `${match[2]}-${month}-01` : '';
}

function launchMonthSortValue(label) {
  const normalized = normalizeLaunchMonthLabel(label).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized || normalized === 'без месяца') return Number.MAX_SAFE_INTEGER - 1;
  if (normalized.includes('текущий') || normalized.includes('фокус')) return Number.MAX_SAFE_INTEGER - 2;
  const dateKey = launchMonthDateKey(normalized);
  if (!dateKey) return Number.MAX_SAFE_INTEGER;
  return Number(dateKey.slice(0, 4)) * 100 + Number(dateKey.slice(5, 7));
}

const LAUNCH_MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const LEGACY_LAUNCH_MANAGER_STORAGE_KEY = 'brand-portal-launch-manager-v1';
const LEGACY_LAUNCH_MANAGER_MIGRATION_KEY = 'brand-portal-launch-manager-v1-migrated-20260502b';

function launchMonthName(index) {
  return LAUNCH_MONTH_NAMES[index] || '';
}

function launchMonthNumber(label = '') {
  const normalized = String(label || '').trim().toLowerCase();
  return LAUNCH_MONTH_NAMES.findIndex((item) => item.toLowerCase() === normalized) + 1;
}

function launchMonthKeyToLabel(monthKey = '') {
  const match = String(monthKey || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return '';
  const label = launchMonthName(Number(match[2]) - 1);
  return label ? `${label} ${match[1]}` : '';
}

function launchParseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = Number(raw.replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function launchPortalMonthPlanLabels(baseLabel = '') {
  const startKey = launchMonthDateKey(baseLabel) || `${todayIso().slice(0, 7)}-01`;
  const start = new Date(`${startKey}T00:00:00`);
  if (Number.isNaN(start.getTime())) return LAUNCH_MONTH_NAMES.slice(0, 8);
  start.setDate(1);
  const labels = [];
  for (let index = 0; index < 8; index += 1) {
    labels.push(launchMonthName(start.getMonth()));
    start.setMonth(start.getMonth() + 1);
  }
  return labels;
}

function normalizeLaunchPlanList(plan, fallbackLabels = []) {
  const labels = fallbackLabels.length ? fallbackLabels : launchPortalMonthPlanLabels();
  const valuesByLabel = new Map();
  (Array.isArray(plan) ? plan : []).forEach((item) => {
    const label = String(item?.label || '').trim();
    if (!label) return;
    valuesByLabel.set(label, launchParseNumber(item?.value));
  });
  return labels.map((label) => ({
    label,
    value: valuesByLabel.has(label) ? valuesByLabel.get(label) : null
  }));
}

function normalizeLaunchGanttMonths(gantt) {
  const unique = new Map();
  (Array.isArray(gantt) ? gantt : []).forEach((entry) => {
    const year = Number(entry?.year);
    const label = String(entry?.label || '').trim();
    const monthKey = String(entry?.monthKey || '').trim();
    if (!label || !year) return;
    const resolvedMonthKey = monthKey || `${year}-${String(launchMonthNumber(label)).padStart(2, '0')}`;
    unique.set(resolvedMonthKey, {
      year,
      label,
      monthKey: resolvedMonthKey,
      value: launchParseNumber(entry?.value) ?? 1
    });
  });
  return [...unique.values()].sort((left, right) => String(left.monthKey).localeCompare(String(right.monthKey)));
}

function launchStableId(item = {}) {
  return String(item?.id || '').trim() || stableId('launch', `${item?.articleKey || ''}|${item?.name || item?.title || ''}|${item?.reportGroup || ''}|${item?.launchMonth || ''}`);
}

function launchDueDateKey(item = {}) {
  const exact = String(item?.launchDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(exact)) return exact;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(item?.launchDateKey || '').trim())) return String(item.launchDateKey).trim();
  return launchMonthDateKey(item?.launchMonth || '');
}

function launchDueDateLabel(item = {}) {
  const exact = String(item?.launchDate || '').trim();
  if (exact) return exact;
  return item?.launchMonth || 'Без даты';
}

function migrateLegacyLaunchManagerStorage() {
  if (state.__legacyLaunchManagerMigrated) return;
  state.__legacyLaunchManagerMigrated = true;

  try {
    if (localStorage.getItem(LEGACY_LAUNCH_MANAGER_MIGRATION_KEY) === '1') return;
    const raw = localStorage.getItem(LEGACY_LAUNCH_MANAGER_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(LEGACY_LAUNCH_MANAGER_MIGRATION_KEY, '1');
      return;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) {
      localStorage.setItem(LEGACY_LAUNCH_MANAGER_MIGRATION_KEY, '1');
      return;
    }

    const existingOverrides = Array.isArray(state.storage?.launchOverrides) ? state.storage.launchOverrides : [];
    const existingDeleted = Array.isArray(state.storage?.launchDeletedIds) ? state.storage.launchDeletedIds : [];
    const overrideMap = new Map(existingOverrides.map((item) => {
      const draft = serializeLaunchDraft(item);
      return [draft.id, draft];
    }));
    const deletedIds = new Set(existingDeleted.map((item) => String(item || '').trim()).filter(Boolean));
    let changed = false;

    parsed.forEach((record) => {
      if (!record || typeof record !== 'object') return;
      const launchId = String(record.baseId || record.id || '').trim() || launchStableId(record);
      if (!launchId) return;

      if (record.hidden) {
        overrideMap.delete(launchId);
        if (!deletedIds.has(launchId)) {
          deletedIds.add(launchId);
          changed = true;
        }
        return;
      }

      if (deletedIds.has(launchId)) deletedIds.delete(launchId);
      if (overrideMap.has(launchId)) return;
      overrideMap.set(launchId, serializeLaunchDraft({ ...record, id: launchId }));
      changed = true;
    });

    if (changed) {
      state.storage.launchOverrides = [...overrideMap.values()];
      state.storage.launchDeletedIds = [...deletedIds];
      saveLocalStorage();
    }

    localStorage.setItem(LEGACY_LAUNCH_MANAGER_MIGRATION_KEY, '1');
  } catch (error) {
    console.warn('[launches] legacy manager migration skipped', error);
  }
}

function getLaunchStorageOverrides() {
  migrateLegacyLaunchManagerStorage();
  return Array.isArray(state.storage?.launchOverrides)
    ? state.storage.launchOverrides.filter((item) => item && typeof item === 'object')
    : [];
}

function getLaunchDeletedIdSet() {
  migrateLegacyLaunchManagerStorage();
  return new Set(
    Array.isArray(state.storage?.launchDeletedIds)
      ? state.storage.launchDeletedIds.map((item) => String(item || '').trim()).filter(Boolean)
      : []
  );
}

function serializeLaunchDraft(item = {}) {
  const id = launchStableId(item);
  const launchMonth = normalizeLaunchMonthLabel(item.launchMonth || state.dashboard?.dataFreshness?.launchPlanHorizon || 'Текущий фокус');
  const planLabels = launchPortalMonthPlanLabels(launchMonth);
  return {
    id,
    articleKey: String(item.articleKey || '').trim(),
    article: String(item.article || '').trim(),
    owner: String(item.owner || '').trim(),
    reportGroup: String(item.reportGroup || item.segment || 'Продукт').trim() || 'Продукт',
    tag: String(item.tag || 'без тега').trim() || 'без тега',
    skuBucket: String(item.skuBucket || '').trim(),
    launchMonth,
    launchDate: String(item.launchDate || '').trim(),
    status: String(item.status || '').trim(),
    production: String(item.production || '').trim(),
    name: String(item.name || item.title || 'Новинка').trim() || 'Новинка',
    subCategory: String(item.subCategory || item.category || '').trim(),
    characteristic: String(item.characteristic || '').trim(),
    category: String(item.category || item.subCategory || '').trim(),
    marketplaces: String(item.marketplaces || '').trim(),
    registryStatus: String(item.registryStatus || '').trim(),
    segment: String(item.segment || '').trim(),
    presentationUrl: String(item.presentationUrl || '').trim(),
    notes: String(item.notes || '').trim(),
    targetCost: launchParseNumber(item.targetCost),
    srcWithoutVat: launchParseNumber(item.srcWithoutVat),
    srcWithVat: launchParseNumber(item.srcWithVat),
    srcWithSpp28: launchParseNumber(item.srcWithSpp28),
    mrpDeltaPct: launchParseNumber(item.mrpDeltaPct),
    rrpWithVat: launchParseNumber(item.rrpWithVat),
    mrpWithVat: launchParseNumber(item.mrpWithVat),
    grossMarginPct: launchParseNumber(item.grossMarginPct),
    grossMarginRub: launchParseNumber(item.grossMarginRub),
    revenueAnchor: launchParseNumber(item.revenueAnchor),
    yearlyPlanValue: launchParseNumber(item.yearlyPlanValue),
    monthlyRevenuePlan: normalizeLaunchPlanList(item.monthlyRevenuePlan, planLabels),
    monthlyLaunchPlan: normalizeLaunchPlanList(item.monthlyLaunchPlan, planLabels),
    ganttMonths: normalizeLaunchGanttMonths(item.ganttMonths),
    sourceRow: item.sourceRow || '',
    sourceFile: item.sourceFile || 'portal'
  };
}

function upsertLaunchDraft(item = {}) {
  const draft = serializeLaunchDraft(item);
  state.storage.launchOverrides = (state.storage.launchOverrides || []).filter((entry) => launchStableId(entry) !== draft.id);
  state.storage.launchOverrides.unshift(draft);
  state.storage.launchDeletedIds = (state.storage.launchDeletedIds || []).filter((entry) => String(entry || '').trim() !== draft.id);
  saveLocalStorage();
  return draft;
}

function deleteLaunchDraft(id = '') {
  const launchId = String(id || '').trim();
  if (!launchId) return;
  state.storage.launchOverrides = (state.storage.launchOverrides || []).filter((entry) => launchStableId(entry) !== launchId);
  state.storage.launchDeletedIds = (state.storage.launchDeletedIds || []).filter((entry) => String(entry || '').trim() !== launchId);
  state.storage.launchDeletedIds.unshift(launchId);
  saveLocalStorage();
}

function clearLaunchDraftDelete(id = '') {
  const launchId = String(id || '').trim();
  if (!launchId) return;
  state.storage.launchDeletedIds = (state.storage.launchDeletedIds || []).filter((entry) => String(entry || '').trim() !== launchId);
  saveLocalStorage();
}

function launchPlanSum(plan) {
  return (Array.isArray(plan) ? plan : []).reduce((total, item) => total + numberOrZero(item?.value), 0);
}

function launchLinkedTasks(item, options = {}) {
  if (options.skipTaskLookup) return [];
  const nameKey = String(item?.name || '').trim().toLowerCase();
  return getAllTasks().filter((task) => {
    if (item?.articleKey && task.articleKey === item.articleKey) return true;
    return task.type === 'launch' && String(task.entityLabel || '').trim().toLowerCase() === nameKey;
  });
}

function launchManualActiveTaskCount(articleKey, entityLabel = '') {
  const titleKey = String(entityLabel || '').trim().toLowerCase();
  return (state.storage?.tasks || []).filter((task) => {
    if (!isTaskActive(task)) return false;
    if (articleKey && task.articleKey === articleKey) return true;
    return task.type === 'launch' && String(task.entityLabel || '').trim().toLowerCase() === titleKey;
  }).length;
}

function launchCurrentOwner(item) {
  if (item?.owner) return item.owner;
  const sku = item?.articleKey ? getSku(item.articleKey) : null;
  return ownerName(sku) || '';
}

function launchCurrentPhase(item) {
  if (item?.phase) return item.phase;
  const owner = launchCurrentOwner(item);
  const statusRaw = String(item?.status || '').toLowerCase();
  if (/производ|контракт|поставка|сырье|жд/.test(statusRaw)) return 'supply';
  if (/карточ|контент|дизайн|презент|маркет/.test(statusRaw)) return 'content';
  if (/цен|марж|эконом/.test(statusRaw)) return 'economy';
  if (/запуск|live|продаж|готов/.test(statusRaw)) return 'scale';
  if (!owner) return 'owner';
  if (!String(item?.marketplaces || '').trim()) return 'content';
  return 'supply';
}

function launchBlockers(item) {
  const blockers = Array.isArray(item?.blockers) ? item.blockers.filter(Boolean) : [];
  const daysUntil = launchDaysUntil(item);
  const hasKnownDate = Number.isFinite(daysUntil);
  const nearLaunch = hasKnownDate && daysUntil <= 90;
  const soonLaunch = hasKnownDate && daysUntil <= 45;
  const ownerRequired = !hasKnownDate || daysUntil <= 120;
  if (ownerRequired && !launchCurrentOwner(item)) blockers.push('не назначен owner');
  if (nearLaunch && !String(item?.articleKey || '').trim()) blockers.push('нет связки с реестром SKU');
  if (nearLaunch && !String(item?.marketplaces || '').trim()) blockers.push('не указаны площадки');
  if (!Array.isArray(item?.ganttMonths) || !item.ganttMonths.length) blockers.push('не заполнен gantt');
  if (soonLaunch && !String(item?.presentationUrl || '').trim()) blockers.push('нет презентации / материалов');
  return [...new Set(blockers)];
}

function normalizeLaunchItem(item = {}, options = {}) {
  const launchMonth = normalizeLaunchMonthLabel(item.launchMonth || state.dashboard?.dataFreshness?.launchPlanHorizon || 'Текущий фокус');
  const planLabels = launchPortalMonthPlanLabels(launchMonth);
  const monthlyRevenuePlan = normalizeLaunchPlanList(item.monthlyRevenuePlan, planLabels);
  const monthlyLaunchPlan = normalizeLaunchPlanList(item.monthlyLaunchPlan, planLabels);
  const plannedRevenue = numberOrZero(item.plannedRevenue ?? item.yearlyPlanValue ?? launchPlanSum(monthlyLaunchPlan));
  const owner = launchCurrentOwner(item);
  const phase = launchCurrentPhase(item);
  const linkedTasks = launchLinkedTasks(item, options);
  return {
    id: launchStableId(item),
    articleKey: item.articleKey || '',
    article: item.article || '',
    skuBucket: item.skuBucket || '',
    name: item.name || item.title || 'Новинка',
    reportGroup: item.reportGroup || item.segment || 'Продукт',
    tag: item.tag || 'без тега',
    subCategory: item.subCategory || item.category || '—',
    category: item.category || item.subCategory || '—',
    characteristic: item.characteristic || '',
    marketplaces: item.marketplaces || '',
    launchMonth,
    launchDate: String(item.launchDate || '').trim(),
    launchDateKey: launchDueDateKey(item),
    status: item.status || 'Статус не указан',
    phase,
    owner,
    production: item.production || '',
    plannedRevenue,
    targetCost: launchParseNumber(item.targetCost) ?? 0,
    srcWithoutVat: launchParseNumber(item.srcWithoutVat),
    srcWithVat: launchParseNumber(item.srcWithVat),
    srcWithSpp28: launchParseNumber(item.srcWithSpp28),
    mrpDeltaPct: launchParseNumber(item.mrpDeltaPct),
    rrpWithVat: launchParseNumber(item.rrpWithVat),
    mrpWithVat: launchParseNumber(item.mrpWithVat),
    grossMarginPct: launchParseNumber(item.grossMarginPct),
    grossMarginRub: launchParseNumber(item.grossMarginRub) ?? 0,
    revenueAnchor: launchParseNumber(item.revenueAnchor) ?? 0,
    externalTraffic: item.externalTraffic || 'без внешнего трафика',
    articleMatched: Boolean(item.articleKey),
    ganttMonths: normalizeLaunchGanttMonths(item.ganttMonths),
    monthlyRevenuePlan,
    monthlyLaunchPlan,
    yearlyPlanValue: launchParseNumber(item.yearlyPlanValue) ?? 0,
    registryStatus: item.registryStatus || '',
    segment: item.segment || '',
    presentationUrl: String(item.presentationUrl || '').trim(),
    notes: String(item.notes || '').trim(),
    skuSuggestions: getLaunchSkuSuggestions(item, 3),
    sourceRow: item.sourceRow || '',
    activeTasks: options.skipTaskLookup ? numberOrZero(item.activeTasks) : linkedTasks.filter(isTaskActive).length,
    blockers: launchBlockers(item),
    sourceFile: item.sourceFile || ''
  };
}

function buildLaunchItemsFromSkus(options = {}) {
  return state.skus
    .filter((sku) => String(sku?.segment || '').toUpperCase() === 'GROWTH' || String(sku?.status || '').toLowerCase().includes('нов'))
    .map((sku) => {
      const safeOptions = { ...options, skipTaskLookup: true };
      const phase = deriveLaunchPhase(sku);
      const blockers = [];
      if (!ownerName(sku)) blockers.push('не назначен owner');
      if (totalSkuStock(sku) <= 0) blockers.push('нет остатка');
      if (!sku?.flags?.hasExternalTraffic) blockers.push('нет внешнего трафика');
      if (sku?.flags?.negativeMargin) blockers.push('маржа в риске');
      if (sku?.flags?.highReturn) blockers.push('высокие возвраты');
      const title = sku.name || sku.article || sku.articleKey;
      return normalizeLaunchItem({
        articleKey: sku.articleKey,
        article: sku.article,
        name: title,
        reportGroup: sku.segment || 'GROWTH',
        tag: sku?.flags?.hasExternalTraffic ? 'трафик' : 'база',
        subCategory: sku.category || '—',
        category: sku.category || '—',
        launchMonth: state.dashboard?.dataFreshness?.launchPlanHorizon || 'Текущий фокус',
        launchDate: '',
        status: deriveLaunchStatus(sku),
        phase,
        owner: ownerName(sku),
        production: totalSkuStock(sku) > 0 ? `Остаток ${fmt.int(totalSkuStock(sku))}` : 'Без остатка',
        plannedRevenue: monthRevenue(sku),
        targetCost: 0,
        externalTraffic: externalTrafficLabel(sku),
        activeTasks: launchManualActiveTaskCount(sku.articleKey, title),
        blockers
      }, safeOptions);
    })
    .sort((a, b) => launchMonthSortValue(a.launchMonth) - launchMonthSortValue(b.launchMonth) || b.activeTasks - a.activeTasks || b.plannedRevenue - a.plannedRevenue || a.name.localeCompare(b.name, 'ru'));
}

function getLaunchItems(options = {}) {
  const source = Array.isArray(state.launches) && state.launches.length
    ? state.launches.map((item) => normalizeLaunchItem(item, options))
    : buildLaunchItemsFromSkus(options);
  const overrideMap = new Map(getLaunchStorageOverrides().map((item) => {
    const draft = serializeLaunchDraft(item);
    return [draft.id, draft];
  }));
  const deletedIds = getLaunchDeletedIdSet();
  const baseIds = new Set();
  const merged = [];
  source.forEach((item) => {
    const launchId = launchStableId(item);
    baseIds.add(launchId);
    if (deletedIds.has(launchId)) return;
    const override = overrideMap.get(launchId);
    merged.push(override ? normalizeLaunchItem({ ...item, ...override, id: launchId }, options) : item);
  });
  overrideMap.forEach((item, launchId) => {
    if (baseIds.has(launchId) || deletedIds.has(launchId)) return;
    merged.push(normalizeLaunchItem(item, options));
  });
  return merged.sort((a, b) => launchMonthSortValue(a.launchMonth) - launchMonthSortValue(b.launchMonth) || a.name.localeCompare(b.name, 'ru'));
}

function getLaunchFilters() {
  state.launchFilters = state.launchFilters || {};
  state.launchFilters.month = state.launchFilters.month || 'all';
  state.launchFilters.search = state.launchFilters.search || '';
  state.launchFilters.group = state.launchFilters.group || 'all';
  state.launchFilters.tag = state.launchFilters.tag || 'all';
  state.launchFilters.status = state.launchFilters.status || 'all';
  state.launchFilters.phase = state.launchFilters.phase || 'all';
  state.launchFilters.owner = state.launchFilters.owner || 'all';
  state.launchFilters.readiness = state.launchFilters.readiness || 'all';
  state.launchFilters.tasks = state.launchFilters.tasks || 'all';
  return state.launchFilters;
}

function launchGanttExpanded() {
  const filters = getLaunchFilters();
  if (typeof filters.ganttExpanded !== 'boolean') filters.ganttExpanded = true;
  return filters.ganttExpanded;
}

function setLaunchGanttExpanded(expanded) {
  getLaunchFilters().ganttExpanded = Boolean(expanded);
}

function getLaunchMonthOptions(items) {
  const counts = new Map();
  items.forEach((item) => {
    const label = normalizeLaunchMonthLabel(item.launchMonth);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((left, right) => launchMonthSortValue(left[0]) - launchMonthSortValue(right[0]) || left[0].localeCompare(right[0], 'ru'))
    .map(([label, count]) => ({ label, count }));
}

function launchUniqueOptions(items, getter) {
  return [...new Set(items.map(getter).filter(Boolean))]
    .sort((left, right) => String(left).localeCompare(String(right), 'ru'));
}

function launchHasLinkedSku(item) {
  return Boolean(String(item?.articleKey || '').trim());
}

function launchHasOwner(item) {
  return Boolean(String(launchCurrentOwner(item) || '').trim());
}

function launchHasPresentation(item) {
  return Boolean(String(item?.presentationUrl || '').trim());
}

function launchHasGantt(item) {
  return Array.isArray(item?.ganttMonths) && item.ganttMonths.length > 0;
}

function launchHasActiveTasks(item) {
  return numberOrZero(item?.activeTasks) > 0;
}

function launchIsReady(item) {
  return launchHasOwner(item)
    && launchHasLinkedSku(item)
    && launchHasPresentation(item)
    && launchHasGantt(item)
    && !(item?.blockers || []).length;
}

function launchCoverageSummary(items) {
  return {
    total: items.length,
    withOwner: items.filter(launchHasOwner).length,
    linkedSku: items.filter(launchHasLinkedSku).length,
    withPresentation: items.filter(launchHasPresentation).length,
    withGantt: items.filter(launchHasGantt).length,
    withTasks: items.filter(launchHasActiveTasks).length,
    blocked: items.filter((item) => (item.blockers || []).length).length,
    ready: items.filter(launchIsReady).length
  };
}

function launchLookupText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[ё]/g, 'е')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function launchLookupTokens(...parts) {
  return [...new Set(parts
    .flatMap((part) => launchLookupText(part).split(' '))
    .filter((token) => token && token.length >= 3))];
}

function launchMarketplaceLabelsFromSku(sku) {
  if (!sku || typeof sku !== 'object') return '';
  const labels = [];
  if (sku?.flags?.hasWB) labels.push('WB');
  if (sku?.flags?.hasOzon) labels.push('Ozon');
  if (sku?.ownersByPlatform?.ym) labels.push('Я.Маркет');
  if (sku?.ownersByPlatform?.letu) labels.push('Летуаль');
  if (sku?.ownersByPlatform?.ga) labels.push('ЗЯ');
  return [...new Set(labels)].join(', ');
}

function launchSkuSuggestionScore(item = {}, sku = {}) {
  const itemTokens = launchLookupTokens(item.name, item.subCategory, item.category, item.characteristic, item.reportGroup);
  const skuTokens = launchLookupTokens(sku.name, sku.category, sku.type, sku.article, sku.articleKey);
  if (!itemTokens.length || !skuTokens.length) return 0;
  let score = 0;
  itemTokens.forEach((token) => {
    if (skuTokens.includes(token)) score += token.length >= 7 ? 2 : 1;
  });
  const itemName = launchLookupText(item.name);
  const skuName = launchLookupText(sku.name);
  if (itemName && skuName && (skuName.includes(itemName) || itemName.includes(skuName))) score += 6;
  const itemSub = launchLookupText(item.subCategory || item.category);
  const skuCategory = launchLookupText(sku.category);
  if (itemSub && skuCategory && (skuCategory.includes(itemSub) || itemSub.includes(skuCategory))) score += 2;
  return score;
}

function getLaunchSkuSuggestions(item = {}, limit = 3) {
  if (launchHasLinkedSku(item) || !Array.isArray(state.skus) || !state.skus.length) return [];
  return state.skus
    .map((sku) => ({ sku, score: launchSkuSuggestionScore(item, sku) }))
    .filter((entry) => entry.score >= 3)
    .sort((left, right) => right.score - left.score || String(left.sku?.name || '').localeCompare(String(right.sku?.name || ''), 'ru'))
    .slice(0, limit)
    .map((entry) => ({
      articleKey: entry.sku.articleKey,
      article: entry.sku.article || entry.sku.articleKey,
      name: entry.sku.name || entry.sku.articleKey,
      owner: ownerName(entry.sku) || '',
      category: entry.sku.category || '',
      score: entry.score
    }));
}

function launchEditorSkuOptions(item = {}) {
  const suggestionMap = new Map(getLaunchSkuSuggestions(item, 5).map((entry) => [entry.articleKey, entry]));
  const options = [];
  suggestionMap.forEach((entry) => options.push(entry));
  (state.skus || []).forEach((sku) => {
    const articleKey = String(sku?.articleKey || '').trim();
    if (!articleKey || suggestionMap.has(articleKey)) return;
    options.push({
      articleKey,
      article: sku.article || articleKey,
      name: sku.name || articleKey,
      owner: ownerName(sku) || '',
      category: sku.category || '',
      score: 0
    });
  });
  return options.slice(0, 120);
}

function hydrateLaunchDraftWithSkuLink(draft = {}, options = {}) {
  const articleKey = String(draft.articleKey || '').trim();
  if (!articleKey) return serializeLaunchDraft(draft);
  const sku = getSku(articleKey);
  if (!sku) return serializeLaunchDraft(draft);
  const force = Boolean(options.force);
  const next = { ...draft };
  const setField = (field, value) => {
    if (!String(value || '').trim()) return;
    if (force || !String(next[field] || '').trim()) next[field] = value;
  };
  setField('article', sku.article || articleKey);
  setField('owner', ownerName(sku));
  setField('category', sku.category || '');
  setField('subCategory', next.subCategory || sku.category || '');
  setField('registryStatus', sku.registryStatus || sku.status || '');
  setField('segment', sku.segment || '');
  setField('marketplaces', launchMarketplaceLabelsFromSku(sku));
  return serializeLaunchDraft(next);
}

function applySkuToLaunchEditorForm(form, sku, options = {}) {
  if (!form || !sku) return false;
  const force = Boolean(options.force);
  const write = (name, value, settings = {}) => {
    const field = form.elements.namedItem(name);
    if (!field || typeof field.value === 'undefined') return;
    const always = Boolean(settings.always);
    if (!always && !force && String(field.value || '').trim()) return;
    field.value = value || '';
  };
  write('articleKey', sku.articleKey || '', { always: true });
  write('article', sku.article || sku.articleKey || '', { always: true });
  write('owner', ownerName(sku) || '');
  write('category', sku.category || '');
  write('subCategory', sku.category || '');
  write('registryStatus', sku.registryStatus || sku.status || '');
  write('marketplaces', launchMarketplaceLabelsFromSku(sku));
  return true;
}

function launchSkuSuggestionLabel(entry = {}) {
  return [
    entry.article || entry.articleKey || '',
    entry.name || '',
    entry.owner ? `owner ${entry.owner}` : '',
    entry.score ? `score ${fmt.int(entry.score)}` : ''
  ].filter(Boolean).join(' · ');
}

function launchReadinessLabel(value) {
  const map = {
    all: 'Вся готовность',
    blocked: 'С блокерами',
    ready: 'Готово к запуску',
    'no-owner': 'Без owner',
    'no-sku': 'Без SKU',
    'no-presentation': 'Без презентации',
    'no-gantt': 'Без gantt'
  };
  return map[value] || map.all;
}

function launchTaskFilterLabel(value) {
  const map = {
    all: 'Все задачи',
    with: 'Есть задачи',
    without: 'Без задач'
  };
  return map[value] || map.all;
}

function launchFocusChipClass(active) {
  return active ? 'quick-chip active' : 'quick-chip';
}

function applyLaunchFilterPatch(patch = {}) {
  Object.assign(getLaunchFilters(), patch);
  rerenderCurrentView();
}

function launchDaysUntil(item) {
  const dueDateKey = launchDueDateKey(item);
  if (!dueDateKey) return Number.POSITIVE_INFINITY;
  return diffFromTodayInDays(dueDateKey);
}

function launchExportRows(items) {
  return items.map((item) => ({
    article_key: item.articleKey || '',
    article: item.article || '',
    owner: item.owner || '',
    group: item.reportGroup || '',
    tag: item.tag || '',
    sku_bucket: item.skuBucket || '',
    launch_month: item.launchMonth || '',
    launch_date: item.launchDate || '',
    status: item.status || '',
    phase: launchPhaseMeta(item.phase).label,
    name: item.name || '',
    sub_category: item.subCategory || '',
    marketplaces: item.marketplaces || '',
    characteristic: item.characteristic || '',
    target_cost: item.targetCost || '',
    src_without_vat: item.srcWithoutVat ?? '',
    src_with_vat: item.srcWithVat ?? '',
    src_with_spp28: item.srcWithSpp28 ?? '',
    mrp_delta_pct: item.mrpDeltaPct ?? '',
    rrp_with_vat: item.rrpWithVat ?? '',
    mrp_with_vat: item.mrpWithVat ?? '',
    gross_margin_pct: item.grossMarginPct ?? '',
    gross_margin_rub: item.grossMarginRub ?? '',
    revenue_anchor: item.revenueAnchor ?? '',
    planned_revenue: item.plannedRevenue || '',
    yearly_plan: item.yearlyPlanValue || '',
    active_tasks: item.activeTasks || 0,
    presentation_url: item.presentationUrl || '',
    notes: item.notes || '',
    blockers: (item.blockers || []).join(' | '),
    gantt: (item.ganttMonths || []).map((entry) => `${entry.label} ${entry.year}`).join(', ')
  }));
}

function downloadLaunchesHtmlTable(columns, rows, filename) {
  if (!rows.length) {
    window.alert('По текущим фильтрам нет строк для выгрузки.');
    return;
  }
  const head = `<tr>${columns.map((column) => `<th>${escapeHtml(column[1])}</th>`).join('')}</tr>`;
  const body = rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column[0]])}</td>`).join('')}</tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1">${head}${body}</table></body></html>`;
  const blob = new Blob(['\uFEFF', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadLaunchesExcel(items, scope = 'launches') {
  downloadLaunchesHtmlTable([
    ['group', 'Группа'],
    ['tag', 'Тег'],
    ['sku_bucket', 'SKU bucket'],
    ['launch_month', 'Месяц запуска'],
    ['launch_date', 'Точная дата запуска'],
    ['status', 'Статус'],
    ['phase', 'Этап'],
    ['name', 'Новинка'],
    ['sub_category', 'Подкатегория'],
    ['owner', 'Owner'],
    ['article_key', 'Article key'],
    ['article', 'Артикул'],
    ['marketplaces', 'Площадки'],
    ['characteristic', 'Характеристика'],
    ['target_cost', 'Целевая себестоимость'],
    ['src_without_vat', 'СРЦ без НДС'],
    ['src_with_vat', 'СРЦ с НДС'],
    ['src_with_spp28', 'СРЦ со СПП 28'],
    ['mrp_delta_pct', 'Δ МРЦ'],
    ['rrp_with_vat', 'РРЦ с НДС'],
    ['mrp_with_vat', 'МРЦ с НДС'],
    ['gross_margin_pct', 'Маржа %'],
    ['gross_margin_rub', 'Маржа ₽'],
    ['revenue_anchor', 'Якорная выручка'],
    ['planned_revenue', 'План / сумма'],
    ['yearly_plan', 'План за год'],
    ['active_tasks', 'Активные задачи'],
    ['presentation_url', 'Презентация'],
    ['notes', 'Заметки'],
    ['blockers', 'Блокеры'],
    ['gantt', 'Gantt']
  ], launchExportRows(items), `${scope}-${todayIso()}.xls`);
}

function launchUnionPlanLabels(items, key) {
  const labels = [];
  const seen = new Set();
  (items || []).forEach((item) => {
    (item?.[key] || []).forEach((entry) => {
      const label = String(entry?.label || '').trim();
      if (!label || seen.has(label)) return;
      seen.add(label);
      labels.push(label);
    });
  });
  return labels.length ? labels : launchPortalMonthPlanLabels(items?.[0]?.launchMonth || '');
}

function buildLaunchWorkbookRow(item, revenueLabels, launchLabels) {
  const row = {
    id: item.id || '',
    article_key: item.articleKey || '',
    article: item.article || '',
    owner: item.owner || '',
    report_group: item.reportGroup || '',
    tag: item.tag || '',
    sku_bucket: item.skuBucket || '',
    launch_month: item.launchMonth || '',
    launch_date: item.launchDate || '',
    status: item.status || '',
    production: item.production || '',
    name: item.name || '',
    sub_category: item.subCategory || '',
    category: item.category || '',
    characteristic: item.characteristic || '',
    marketplaces: item.marketplaces || '',
    registry_status: item.registryStatus || '',
    target_cost: item.targetCost ?? '',
    src_without_vat: item.srcWithoutVat ?? '',
    src_with_vat: item.srcWithVat ?? '',
    src_with_spp28: item.srcWithSpp28 ?? '',
    mrp_delta_pct: item.mrpDeltaPct ?? '',
    rrp_with_vat: item.rrpWithVat ?? '',
    mrp_with_vat: item.mrpWithVat ?? '',
    gross_margin_pct: item.grossMarginPct ?? '',
    gross_margin_rub: item.grossMarginRub ?? '',
    revenue_anchor: item.revenueAnchor ?? '',
    yearly_plan: item.yearlyPlanValue ?? '',
    presentation_url: item.presentationUrl || '',
    notes: item.notes || '',
    gantt: (item.ganttMonths || []).map((entry) => `${entry.label} ${entry.year}`).join(', ')
  };
  revenueLabels.forEach((label) => {
    const found = (item.monthlyRevenuePlan || []).find((entry) => entry.label === label);
    row[`revenue_plan__${label}`] = found?.value ?? '';
  });
  launchLabels.forEach((label) => {
    const found = (item.monthlyLaunchPlan || []).find((entry) => entry.label === label);
    row[`launch_plan__${label}`] = found?.value ?? '';
  });
  return row;
}

function downloadLaunchWorkbookTemplate(items) {
  const sourceItems = items && items.length ? items : [normalizeLaunchItem({ launchMonth: state.dashboard?.dataFreshness?.launchPlanHorizon || 'Текущий фокус' }, { skipTaskLookup: true })];
  const revenueLabels = launchUnionPlanLabels(sourceItems, 'monthlyRevenuePlan');
  const launchLabels = launchUnionPlanLabels(sourceItems, 'monthlyLaunchPlan');
  const columns = [
    ['id', 'ID строки'],
    ['report_group', 'Группа'],
    ['tag', 'Тег'],
    ['sku_bucket', 'SKU bucket'],
    ['launch_month', 'Месяц запуска'],
    ['launch_date', 'Точная дата запуска'],
    ['status', 'Статус'],
    ['production', 'Производство'],
    ['name', 'Новинка'],
    ['sub_category', 'Подкатегория'],
    ['category', 'Категория'],
    ['characteristic', 'Характеристика'],
    ['target_cost', 'Целевая себестоимость'],
    ['src_without_vat', 'СРЦ без НДС'],
    ['src_with_vat', 'СРЦ с НДС'],
    ['src_with_spp28', 'СРЦ со СПП 28'],
    ['mrp_delta_pct', 'Δ МРЦ'],
    ['rrp_with_vat', 'РРЦ с НДС'],
    ['mrp_with_vat', 'МРЦ с НДС'],
    ['marketplaces', 'Площадки'],
    ['gross_margin_pct', 'Маржа %'],
    ['gross_margin_rub', 'Маржа ₽'],
    ['revenue_anchor', 'Якорная выручка']
  ];
  revenueLabels.forEach((label) => columns.push([`revenue_plan__${label}`, `План выручки ${label}`]));
  columns.push(['yearly_plan', 'План за год']);
  launchLabels.forEach((label) => columns.push([`launch_plan__${label}`, `План запуска ${label}`]));
  columns.push(['owner', 'Owner']);
  columns.push(['article_key', 'Article key']);
  columns.push(['article', 'Артикул']);
  columns.push(['registry_status', 'Статус в реестре SKU']);
  columns.push(['presentation_url', 'Презентация / ссылка']);
  columns.push(['notes', 'Заметки']);
  columns.push(['gantt', 'Gantt']);
  downloadLaunchesHtmlTable(columns, sourceItems.map((item) => buildLaunchWorkbookRow(item, revenueLabels, launchLabels)), `launch-form-${todayIso()}.xls`);
}

function normalizeLaunchImportHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-zа-я0-9_]+/gi, '_');
}

function parseLaunchHtmlTableText(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');
  return Array.from(doc.querySelectorAll('tr'))
    .map((row) => Array.from(row.querySelectorAll('th,td')).map((cell) => String(cell.textContent || '').trim()))
    .filter((row) => row.some((value) => value));
}

function parseLaunchDelimitedText(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').filter((line) => String(line).trim());
  const first = lines[0] || '';
  let delimiter = '\t';
  if (!first.includes('\t')) delimiter = first.includes(';') ? ';' : ',';
  return lines.map((line) => line.split(delimiter).map((part) => String(part || '').trim().replace(/^"(.*)"$/, '$1')));
}

function parseLaunchGanttText(text) {
  return String(text || '')
    .split(/[,;]+/)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => {
      const dateMatch = item.match(/^(\d{4})-(\d{2})$/);
      if (dateMatch) {
        return {
          year: Number(dateMatch[1]),
          label: launchMonthName(Number(dateMatch[2]) - 1),
          monthKey: `${dateMatch[1]}-${dateMatch[2]}`,
          value: 1
        };
      }
      const labelMatch = item.match(/^([а-яё]+)\s+(\d{4})$/i);
      if (!labelMatch) return null;
      const monthNumber = launchMonthNumber(labelMatch[1]);
      if (!monthNumber) return null;
      return {
        year: Number(labelMatch[2]),
        label: launchMonthName(monthNumber - 1),
        monthKey: `${labelMatch[2]}-${String(monthNumber).padStart(2, '0')}`,
        value: 1
      };
    })
    .filter(Boolean);
}

function parseLaunchWorkbookRows(text) {
  const matrix = /<table[\s>]/i.test(text) ? parseLaunchHtmlTableText(text) : parseLaunchDelimitedText(text);
  if (!matrix.length) return [];
  const headers = matrix[0].map(normalizeLaunchImportHeader);
  const findColumn = (...aliases) => aliases.map(normalizeLaunchImportHeader).map((alias) => headers.indexOf(alias)).find((index) => index >= 0) ?? -1;
  const revenueColumns = headers
    .map((header, index) => {
      if (header.startsWith('revenue_plan__')) return { index, label: header.replace('revenue_plan__', '').replace(/_/g, ' ') };
      if (header.startsWith('план_выручки_')) return { index, label: header.replace('план_выручки_', '').replace(/_/g, ' ') };
      return null;
    })
    .filter(Boolean)
    .map((item) => ({ ...item, label: item.label.charAt(0).toUpperCase() + item.label.slice(1) }));
  const launchColumns = headers
    .map((header, index) => {
      if (header.startsWith('launch_plan__')) return { index, label: header.replace('launch_plan__', '').replace(/_/g, ' ') };
      if (header.startsWith('план_запуска_')) return { index, label: header.replace('план_запуска_', '').replace(/_/g, ' ') };
      return null;
    })
    .filter(Boolean)
    .map((item) => ({ ...item, label: item.label.charAt(0).toUpperCase() + item.label.slice(1) }));
  const indexes = {
    id: findColumn('id', 'id_строки'),
    articleKey: findColumn('article_key', 'articlekey'),
    article: findColumn('article', 'артикул'),
    owner: findColumn('owner'),
    reportGroup: findColumn('report_group', 'group', 'группа'),
    tag: findColumn('tag', 'тег'),
    skuBucket: findColumn('sku_bucket'),
    launchMonth: findColumn('launch_month', 'месяц_запуска'),
    launchDate: findColumn('launch_date', 'точная_дата_запуска'),
    status: findColumn('status', 'статус'),
    production: findColumn('production', 'производство'),
    name: findColumn('name', 'новинка', 'товар'),
    subCategory: findColumn('sub_category', 'подкатегория'),
    category: findColumn('category', 'категория'),
    characteristic: findColumn('characteristic', 'характеристика'),
    marketplaces: findColumn('marketplaces', 'площадки'),
    registryStatus: findColumn('registry_status', 'статус_в_реестре_sku'),
    targetCost: findColumn('target_cost', 'целевая_себестоимость'),
    srcWithoutVat: findColumn('src_without_vat', 'срц_без_ндс'),
    srcWithVat: findColumn('src_with_vat', 'срц_с_ндс'),
    srcWithSpp28: findColumn('src_with_spp28', 'срц_со_спп_28'),
    mrpDeltaPct: findColumn('mrp_delta_pct'),
    rrpWithVat: findColumn('rrp_with_vat', 'ррц_с_ндс'),
    mrpWithVat: findColumn('mrp_with_vat', 'мрц_с_ндс'),
    grossMarginPct: findColumn('gross_margin_pct', 'маржа'),
    grossMarginRub: findColumn('gross_margin_rub', 'маржа_'),
    revenueAnchor: findColumn('revenue_anchor', 'якорная_выручка'),
    yearlyPlanValue: findColumn('yearly_plan', 'план_за_год'),
    presentationUrl: findColumn('presentation_url', 'презентация___ссылка', 'презентация'),
    notes: findColumn('notes', 'заметки'),
    gantt: findColumn('gantt')
  };
  return matrix.slice(1).map((row, rowIndex) => {
    const name = indexes.name >= 0 ? String(row[indexes.name] || '').trim() : '';
    const reportGroup = indexes.reportGroup >= 0 ? String(row[indexes.reportGroup] || '').trim() : '';
    const articleKey = indexes.articleKey >= 0 ? String(row[indexes.articleKey] || '').trim() : '';
    if (!name && !reportGroup && !articleKey) return null;
    return serializeLaunchDraft({
      id: indexes.id >= 0 ? String(row[indexes.id] || '').trim() || `launch-import-${rowIndex + 1}` : `launch-import-${rowIndex + 1}`,
      articleKey,
      article: indexes.article >= 0 ? row[indexes.article] : '',
      owner: indexes.owner >= 0 ? row[indexes.owner] : '',
      reportGroup,
      tag: indexes.tag >= 0 ? row[indexes.tag] : '',
      skuBucket: indexes.skuBucket >= 0 ? row[indexes.skuBucket] : '',
      launchMonth: indexes.launchMonth >= 0 ? row[indexes.launchMonth] : '',
      launchDate: indexes.launchDate >= 0 ? row[indexes.launchDate] : '',
      status: indexes.status >= 0 ? row[indexes.status] : '',
      production: indexes.production >= 0 ? row[indexes.production] : '',
      name,
      subCategory: indexes.subCategory >= 0 ? row[indexes.subCategory] : '',
      category: indexes.category >= 0 ? row[indexes.category] : '',
      characteristic: indexes.characteristic >= 0 ? row[indexes.characteristic] : '',
      marketplaces: indexes.marketplaces >= 0 ? row[indexes.marketplaces] : '',
      registryStatus: indexes.registryStatus >= 0 ? row[indexes.registryStatus] : '',
      targetCost: indexes.targetCost >= 0 ? row[indexes.targetCost] : '',
      srcWithoutVat: indexes.srcWithoutVat >= 0 ? row[indexes.srcWithoutVat] : '',
      srcWithVat: indexes.srcWithVat >= 0 ? row[indexes.srcWithVat] : '',
      srcWithSpp28: indexes.srcWithSpp28 >= 0 ? row[indexes.srcWithSpp28] : '',
      mrpDeltaPct: indexes.mrpDeltaPct >= 0 ? row[indexes.mrpDeltaPct] : '',
      rrpWithVat: indexes.rrpWithVat >= 0 ? row[indexes.rrpWithVat] : '',
      mrpWithVat: indexes.mrpWithVat >= 0 ? row[indexes.mrpWithVat] : '',
      grossMarginPct: indexes.grossMarginPct >= 0 ? row[indexes.grossMarginPct] : '',
      grossMarginRub: indexes.grossMarginRub >= 0 ? row[indexes.grossMarginRub] : '',
      revenueAnchor: indexes.revenueAnchor >= 0 ? row[indexes.revenueAnchor] : '',
      yearlyPlanValue: indexes.yearlyPlanValue >= 0 ? row[indexes.yearlyPlanValue] : '',
      presentationUrl: indexes.presentationUrl >= 0 ? row[indexes.presentationUrl] : '',
      notes: indexes.notes >= 0 ? row[indexes.notes] : '',
      monthlyRevenuePlan: revenueColumns.map((column) => ({ label: column.label, value: row[column.index] })),
      monthlyLaunchPlan: launchColumns.map((column) => ({ label: column.label, value: row[column.index] })),
      ganttMonths: indexes.gantt >= 0 ? parseLaunchGanttText(row[indexes.gantt]) : []
    });
  }).filter(Boolean);
}

function importLaunchWorkbookFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const parsedRows = parseLaunchWorkbookRows(String(reader.result || ''));
      if (!parsedRows.length) {
        window.alert('Не удалось распознать форму новинок. Используйте шаблон, скачанный с вкладки Продукт.');
        return;
      }
      parsedRows.forEach((row) => upsertLaunchDraft(row));
      rerenderCurrentView();
      window.alert(`Форма новинок загружена: ${parsedRows.length} строк.`);
    } catch (error) {
      console.error('[launches] import', error);
      window.alert('Не удалось загрузить файл новинок.');
    }
  };
  reader.readAsText(file, 'utf-8');
}

function getLaunchViewModel() {
  const items = getLaunchItems();
  const filters = getLaunchFilters();
  const months = getLaunchMonthOptions(items);
  const groups = launchUniqueOptions(items, (item) => item.reportGroup);
  const tags = launchUniqueOptions(items, (item) => item.tag);
  const statuses = launchUniqueOptions(items, (item) => item.status);
  const owners = launchUniqueOptions(items, (item) => launchCurrentOwner(item));
  const phases = ['owner', 'supply', 'content', 'economy', 'scale'];
  if (filters.month !== 'all' && !months.some((item) => item.label === filters.month)) filters.month = 'all';
  if (filters.group !== 'all' && !groups.includes(filters.group)) filters.group = 'all';
  if (filters.tag !== 'all' && !tags.includes(filters.tag)) filters.tag = 'all';
  if (filters.status !== 'all' && !statuses.includes(filters.status)) filters.status = 'all';
  if (filters.owner !== 'all' && !owners.includes(filters.owner)) filters.owner = 'all';
  if (filters.phase !== 'all' && !phases.includes(filters.phase)) filters.phase = 'all';
  if (!['all', 'blocked', 'ready', 'no-owner', 'no-sku', 'no-presentation', 'no-gantt'].includes(filters.readiness)) filters.readiness = 'all';
  if (!['all', 'with', 'without'].includes(filters.tasks)) filters.tasks = 'all';
  const search = String(filters.search || '').trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    if (filters.month !== 'all' && normalizeLaunchMonthLabel(item.launchMonth) !== filters.month) return false;
    if (filters.group !== 'all' && item.reportGroup !== filters.group) return false;
    if (filters.tag !== 'all' && item.tag !== filters.tag) return false;
    if (filters.status !== 'all' && item.status !== filters.status) return false;
    if (filters.phase !== 'all' && item.phase !== filters.phase) return false;
    if (filters.owner !== 'all' && launchCurrentOwner(item) !== filters.owner) return false;
    if (filters.tasks === 'with' && !launchHasActiveTasks(item)) return false;
    if (filters.tasks === 'without' && launchHasActiveTasks(item)) return false;
    if (filters.readiness === 'blocked' && !(item.blockers || []).length) return false;
    if (filters.readiness === 'ready' && !launchIsReady(item)) return false;
    if (filters.readiness === 'no-owner' && launchHasOwner(item)) return false;
    if (filters.readiness === 'no-sku' && launchHasLinkedSku(item)) return false;
    if (filters.readiness === 'no-presentation' && launchHasPresentation(item)) return false;
    if (filters.readiness === 'no-gantt' && launchHasGantt(item)) return false;
    if (!search) return true;
    const haystack = [
      item.name,
      item.articleKey,
      item.article,
      item.reportGroup,
      item.subCategory,
      item.characteristic,
      item.owner,
      item.status,
      item.marketplaces
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(search);
  });
  const sectionMap = new Map();
  filteredItems.forEach((item) => {
    const label = normalizeLaunchMonthLabel(item.launchMonth);
    const bucket = sectionMap.get(label) || [];
    bucket.push(item);
    sectionMap.set(label, bucket);
  });
  const sections = [...sectionMap.entries()]
    .sort((left, right) => launchMonthSortValue(left[0]) - launchMonthSortValue(right[0]) || left[0].localeCompare(right[0], 'ru'))
    .map(([label, monthItems]) => ({ label, items: monthItems.sort((a, b) => a.name.localeCompare(b.name, 'ru')) }));
  const ganttColumns = [...new Set(filteredItems
    .flatMap((item) => item.ganttMonths || [])
    .map((entry) => `${entry.label} ${entry.year}`)
    .filter(Boolean))]
    .sort((left, right) => launchMonthSortValue(left) - launchMonthSortValue(right) || left.localeCompare(right, 'ru'))
    .slice(0, 12);
  const upcomingItems = filteredItems
    .filter((item) => {
      const days = launchDaysUntil(item);
      return Number.isFinite(days) && days >= -10 && days <= 45;
    })
    .sort((a, b) => launchMonthSortValue(a.launchMonth) - launchMonthSortValue(b.launchMonth) || a.name.localeCompare(b.name, 'ru'));
  const fullSummary = launchCoverageSummary(items);
  const filteredSummary = launchCoverageSummary(filteredItems);
  const sourceFiles = [...new Set(items.map((item) => String(item.sourceFile || '').trim()).filter(Boolean))];
  return {
    items,
    filters,
    months,
    groups,
    tags,
    statuses,
    owners,
    phases,
    filteredItems,
    sections,
    ganttColumns,
    upcomingItems,
    fullSummary,
    filteredSummary,
    sourceFiles
  };
}

function renderLaunchMonthFilters(model) {
  const sourceLabel = model.sourceFiles[0] || 'Портальные черновики';
  const activeFilterBadges = [
    model.filters.month !== 'all' ? badge(model.filters.month, 'warn') : '',
    model.filters.owner !== 'all' ? badge(model.filters.owner, 'info') : '',
    model.filters.readiness !== 'all' ? badge(launchReadinessLabel(model.filters.readiness), 'warn') : '',
    model.filters.tasks !== 'all' ? badge(launchTaskFilterLabel(model.filters.tasks), 'info') : ''
  ].filter(Boolean).join('');
  return `
    <div class="card launch-filter-shell" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Фильтры продукта</h3>
          <p class="small muted">Слой строится из файла Ксюши и gantt. Здесь быстро видно, что именно мешает запуску: owner, SKU, материалы, gantt или отсутствие задач. Выгрузка в Excel берёт уже отфильтрованный список.</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(model.filteredItems.length)} строк`, model.filteredItems.length ? 'info' : 'warn')}
          ${activeFilterBadges || badge('Все строки', 'ok')}
        </div>
      </div>
      <div class="launch-source-bar" style="margin-top:12px">
        <div class="badge-stack">
          ${badge(sourceLabel, 'info')}
          ${badge(`SKU связано ${fmt.int(model.fullSummary.linkedSku)} / ${fmt.int(model.fullSummary.total)}`, model.fullSummary.linkedSku ? 'info' : 'warn')}
          ${badge(`Gantt заполнен ${fmt.int(model.fullSummary.withGantt)}`, model.fullSummary.withGantt ? 'ok' : 'warn')}
          ${badge(`Материалы ${fmt.int(model.fullSummary.withPresentation)}`, model.fullSummary.withPresentation ? 'ok' : 'warn')}
        </div>
      </div>
      <div class="control-filters launch-filter-grid" style="margin-top:12px">
        <input id="launchSearchInput" placeholder="Поиск по новинке, SKU, owner, характеристике…" value="${escapeHtml(model.filters.search)}">
        <select id="launchMonthFilter">
          <option value="all">Все месяцы</option>
          ${model.months.map((item) => `<option value="${escapeHtml(item.label)}" ${model.filters.month === item.label ? 'selected' : ''}>${escapeHtml(item.label)} · ${fmt.int(item.count)}</option>`).join('')}
        </select>
        <select id="launchGroupFilter">
          <option value="all">Все группы</option>
          ${model.groups.map((item) => `<option value="${escapeHtml(item)}" ${model.filters.group === item ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}
        </select>
        <select id="launchTagFilter">
          <option value="all">Все теги</option>
          ${model.tags.map((item) => `<option value="${escapeHtml(item)}" ${model.filters.tag === item ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}
        </select>
        <select id="launchStatusFilter">
          <option value="all">Все статусы</option>
          ${model.statuses.map((item) => `<option value="${escapeHtml(item)}" ${model.filters.status === item ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}
        </select>
        <select id="launchPhaseFilter">
          <option value="all">Все этапы</option>
          ${model.phases.map((item) => `<option value="${item}" ${model.filters.phase === item ? 'selected' : ''}>${escapeHtml(launchPhaseMeta(item).label)}</option>`).join('')}
        </select>
        <select id="launchOwnerFilter">
          <option value="all">Все owner</option>
          ${model.owners.map((item) => `<option value="${escapeHtml(item)}" ${model.filters.owner === item ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}
        </select>
        <select id="launchReadinessFilter">
          <option value="all">Вся готовность</option>
          <option value="blocked" ${model.filters.readiness === 'blocked' ? 'selected' : ''}>С блокерами</option>
          <option value="ready" ${model.filters.readiness === 'ready' ? 'selected' : ''}>Готово к запуску</option>
          <option value="no-owner" ${model.filters.readiness === 'no-owner' ? 'selected' : ''}>Без owner</option>
          <option value="no-sku" ${model.filters.readiness === 'no-sku' ? 'selected' : ''}>Без SKU</option>
          <option value="no-presentation" ${model.filters.readiness === 'no-presentation' ? 'selected' : ''}>Без презентации</option>
          <option value="no-gantt" ${model.filters.readiness === 'no-gantt' ? 'selected' : ''}>Без gantt</option>
        </select>
        <select id="launchTaskFilter">
          <option value="all">Все задачи</option>
          <option value="with" ${model.filters.tasks === 'with' ? 'selected' : ''}>Есть задачи</option>
          <option value="without" ${model.filters.tasks === 'without' ? 'selected' : ''}>Без задач</option>
        </select>
      </div>
      <div class="quick-actions launch-focus-rail" style="margin-top:12px">
        <button class="${launchFocusChipClass(model.filters.readiness === 'no-owner')}" type="button" data-launch-preset="no-owner">Без owner · ${fmt.int(model.fullSummary.total - model.fullSummary.withOwner)}</button>
        <button class="${launchFocusChipClass(model.filters.readiness === 'no-sku')}" type="button" data-launch-preset="no-sku">Без SKU · ${fmt.int(model.fullSummary.total - model.fullSummary.linkedSku)}</button>
        <button class="${launchFocusChipClass(model.filters.readiness === 'no-presentation')}" type="button" data-launch-preset="no-presentation">Без материалов · ${fmt.int(model.fullSummary.total - model.fullSummary.withPresentation)}</button>
        <button class="${launchFocusChipClass(model.filters.readiness === 'blocked')}" type="button" data-launch-preset="blocked">С блокерами · ${fmt.int(model.fullSummary.blocked)}</button>
        <button class="${launchFocusChipClass(model.filters.tasks === 'without')}" type="button" data-launch-preset="without-tasks">Без задач · ${fmt.int(model.fullSummary.total - model.fullSummary.withTasks)}</button>
        <button class="${launchFocusChipClass(model.filters.readiness === 'ready')}" type="button" data-launch-preset="ready">Готово · ${fmt.int(model.fullSummary.ready)}</button>
      </div>
      <div class="quick-actions" style="margin-top:12px">
        <button class="quick-chip portal-action-primary" type="button" data-launch-export="product">Выгрузить в Excel</button>
        <button class="quick-chip" type="button" data-launch-export="launch-control">Выгрузить запуск в Excel</button>
        <button class="quick-chip portal-action-primary" type="button" data-launch-download-form>Скачать форму Excel</button>
        <button class="quick-chip" type="button" data-launch-import>Загрузить файл новинок</button>
        <button class="quick-chip" type="button" data-launch-add>Добавить новинку</button>
        <button class="quick-chip" type="button" data-launch-reset>Сбросить фильтры</button>
      </div>
      <input type="file" id="launchWorkbookImport" accept=".xls,.html,.csv,.tsv,.txt" style="display:none">
    </div>
  `;
}

function bindLaunchMonthFilters(root, model) {
  root.querySelector('#launchSearchInput')?.addEventListener('input', (event) => {
    getLaunchFilters().search = event.target.value;
    rerenderCurrentView();
  });
  root.querySelector('#launchMonthFilter')?.addEventListener('change', (event) => {
    getLaunchFilters().month = event.target.value;
    rerenderCurrentView();
  });
  root.querySelector('#launchGroupFilter')?.addEventListener('change', (event) => {
    getLaunchFilters().group = event.target.value;
    rerenderCurrentView();
  });
  root.querySelector('#launchTagFilter')?.addEventListener('change', (event) => {
    getLaunchFilters().tag = event.target.value;
    rerenderCurrentView();
  });
  root.querySelector('#launchStatusFilter')?.addEventListener('change', (event) => {
    getLaunchFilters().status = event.target.value;
    rerenderCurrentView();
  });
  root.querySelector('#launchPhaseFilter')?.addEventListener('change', (event) => {
    getLaunchFilters().phase = event.target.value;
    rerenderCurrentView();
  });
  root.querySelector('#launchOwnerFilter')?.addEventListener('change', (event) => {
    getLaunchFilters().owner = event.target.value;
    rerenderCurrentView();
  });
  root.querySelector('#launchReadinessFilter')?.addEventListener('change', (event) => {
    getLaunchFilters().readiness = event.target.value;
    rerenderCurrentView();
  });
  root.querySelector('#launchTaskFilter')?.addEventListener('change', (event) => {
    getLaunchFilters().tasks = event.target.value;
    rerenderCurrentView();
  });
  root.querySelectorAll('[data-launch-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const preset = button.getAttribute('data-launch-preset') || '';
      if (preset === 'without-tasks') {
        applyLaunchFilterPatch({ tasks: model.filters.tasks === 'without' ? 'all' : 'without' });
        return;
      }
      applyLaunchFilterPatch({ readiness: model.filters.readiness === preset ? 'all' : preset });
    });
  });
  root.querySelectorAll('[data-launch-export]').forEach((button) => {
    button.addEventListener('click', () => {
      const scope = button.getAttribute('data-launch-export') || 'launches';
      downloadLaunchesExcel(model.filteredItems, scope);
    });
  });
  root.querySelector('[data-launch-download-form]')?.addEventListener('click', () => {
    downloadLaunchWorkbookTemplate(model.filteredItems.length ? model.filteredItems : model.items);
  });
  root.querySelector('[data-launch-import]')?.addEventListener('click', () => {
    root.querySelector('#launchWorkbookImport')?.click();
  });
  root.querySelector('#launchWorkbookImport')?.addEventListener('change', (event) => {
    importLaunchWorkbookFile(event.target.files?.[0]);
    event.target.value = '';
  });
  root.querySelector('[data-launch-add]')?.addEventListener('click', () => {
    openLaunchEditor();
  });
  root.querySelector('[data-launch-reset]')?.addEventListener('click', () => {
    state.launchFilters = {
      month: 'all',
      search: '',
      group: 'all',
      tag: 'all',
      status: 'all',
      phase: 'all',
      owner: 'all',
      readiness: 'all',
      tasks: 'all',
      ganttExpanded: true
    };
    rerenderCurrentView();
  });
}

function bindLaunchGanttFold(root) {
  const panel = root.querySelector('[data-launch-gantt-fold]');
  if (!panel) return;
  panel.addEventListener('toggle', () => {
    setLaunchGanttExpanded(panel.open);
  });
}

function ensureLaunchEditorModal() {
  let modal = document.getElementById('launchEditorModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'launchEditorModal';
  modal.className = 'modal';
  modal.innerHTML = '<div class="modal-card task-modal-card" id="launchEditorModalBody"></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', (event) => {
    if (event.target.id === 'launchEditorModal') closeLaunchEditor();
  });
  return modal;
}

function closeLaunchEditor() {
  document.getElementById('launchEditorModal')?.classList.remove('open');
}

function launchEditorMonthColumns(item = {}) {
  const anchorKey = launchDueDateKey(item) || `${todayIso().slice(0, 7)}-01`;
  const anchorDate = new Date(`${anchorKey}T00:00:00`);
  const startYear = Number.isNaN(anchorDate.getTime()) ? new Date().getFullYear() : anchorDate.getFullYear();
  const columns = [];
  [startYear, startYear + 1].forEach((year) => {
    for (let month = 1; month <= 12; month += 1) {
      columns.push({
        year,
        label: launchMonthName(month - 1),
        monthKey: `${year}-${String(month).padStart(2, '0')}`
      });
    }
  });
  return columns;
}

function launchLinkHtml(url = '', label = 'Презентация') {
  const href = String(url || '').trim();
  if (!href) return '';
  return `<a class="link-btn" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function findLaunchManualTasks(item = {}) {
  const nameKey = String(item?.name || '').trim().toLowerCase();
  return sortTasks((state.storage?.tasks || []).filter((task) => {
    if (!isTaskActive(task)) return false;
    if (task.type !== 'launch') return false;
    if (item.articleKey && task.articleKey === item.articleKey) return true;
    return String(task.entityLabel || '').trim().toLowerCase() === nameKey;
  }));
}

async function createOrOpenLaunchTask(item = {}) {
  const linkedTasks = launchLinkedTasks(item);
  const manualLinkedTasks = linkedTasks.filter((task) => task?.source !== 'auto');
  const manualFallbackTasks = findLaunchManualTasks(item);
  const existingManual = [...manualLinkedTasks, ...manualFallbackTasks].find((task) => task?.id && isTaskActive(task));
  if (existingManual?.id) {
    openTaskModal(existingManual.id);
    return existingManual;
  }
  const dueDate = launchDueDateKey(item);
  const dueOffset = launchDaysUntil(item);
  const task = await createManualTask({
    articleKey: item.articleKey || '',
    entityLabel: item.name || 'Новинка',
    title: 'Подготовить запуск новинки',
    type: 'launch',
    priority: Number.isFinite(dueOffset) && dueOffset <= 14 ? 'high' : 'medium',
    platform: 'product',
    owner: item.owner || '',
    due: dueDate && Number.isFinite(diffFromTodayInDays(dueDate)) && diffFromTodayInDays(dueDate) > 0 ? dueDate : plusDays(3),
    nextAction: `Проверить owner, карточку, презентацию, запуск в реестре SKU, gantt и ближайшие блокеры.${item.notes ? ` Контекст: ${item.notes}` : ''}`,
    reason: [
      item.launchMonth,
      item.status,
      item.marketplaces,
      item.articleKey ? 'SKU связано' : 'без SKU'
    ].filter(Boolean).join(' · ')
  });
  if (task?.id) openTaskModal(task.id);
  return task;
}

function getLaunchEditorItem(launchId = '') {
  if (!launchId) {
    return normalizeLaunchItem({
      id: uid('launch'),
      reportGroup: 'Продукт',
      launchMonth: state.dashboard?.dataFreshness?.launchPlanHorizon || 'Текущий фокус',
      status: 'Черновик'
    }, { skipTaskLookup: true });
  }
  return getLaunchItems({ skipTaskLookup: true }).find((item) => item.id === launchId)
    || normalizeLaunchItem({ id: launchId, reportGroup: 'Продукт', launchMonth: state.dashboard?.dataFreshness?.launchPlanHorizon || 'Текущий фокус' }, { skipTaskLookup: true });
}

function readLaunchEditorForm(form, currentItem, revenuePlan, launchPlan, ganttColumns) {
  const data = new FormData(form);
  return hydrateLaunchDraftWithSkuLink({
    id: data.get('id') || currentItem.id,
    articleKey: data.get('articleKey'),
    article: data.get('article'),
    owner: data.get('owner'),
    reportGroup: data.get('reportGroup'),
    tag: data.get('tag'),
    skuBucket: data.get('skuBucket'),
    launchMonth: data.get('launchMonth'),
    launchDate: data.get('launchDate'),
    status: data.get('status'),
    production: data.get('production'),
    name: data.get('name'),
    subCategory: data.get('subCategory'),
    category: data.get('category'),
    characteristic: data.get('characteristic'),
    marketplaces: data.get('marketplaces'),
    registryStatus: data.get('registryStatus'),
    presentationUrl: data.get('presentationUrl'),
    notes: data.get('notes'),
    targetCost: data.get('targetCost'),
    srcWithoutVat: data.get('srcWithoutVat'),
    srcWithVat: data.get('srcWithVat'),
    srcWithSpp28: data.get('srcWithSpp28'),
    mrpDeltaPct: data.get('mrpDeltaPct'),
    rrpWithVat: data.get('rrpWithVat'),
    mrpWithVat: data.get('mrpWithVat'),
    grossMarginPct: data.get('grossMarginPct'),
    grossMarginRub: data.get('grossMarginRub'),
    revenueAnchor: data.get('revenueAnchor'),
    yearlyPlanValue: data.get('yearlyPlanValue'),
    monthlyRevenuePlan: revenuePlan.map((entry, index) => ({ label: entry.label, value: data.get(`revenuePlan__${index}`) })),
    monthlyLaunchPlan: launchPlan.map((entry, index) => ({ label: entry.label, value: data.get(`launchPlan__${index}`) })),
    ganttMonths: ganttColumns
      .filter((column) => data.get(`gantt__${column.monthKey}`))
      .map((column) => ({ year: column.year, label: column.label, monthKey: column.monthKey, value: 1 })),
    sourceFile: currentItem.sourceFile || 'portal',
    sourceRow: currentItem.sourceRow || ''
  });
}

function openLaunchEditor(launchId = '') {
  const currentItem = getLaunchEditorItem(launchId);
  const revenuePlan = normalizeLaunchPlanList(currentItem.monthlyRevenuePlan, launchPortalMonthPlanLabels(currentItem.launchMonth));
  const launchPlan = normalizeLaunchPlanList(currentItem.monthlyLaunchPlan, revenuePlan.map((entry) => entry.label));
  const ganttColumns = launchEditorMonthColumns(currentItem);
  const activeGantt = new Set((currentItem.ganttMonths || []).map((entry) => entry.monthKey));
  const owners = ownerOptions();
  const skuOptions = launchEditorSkuOptions(currentItem);
  const skuSuggestions = currentItem.skuSuggestions || getLaunchSkuSuggestions(currentItem, 3);
  const linkedSku = currentItem.articleKey ? getSku(currentItem.articleKey) : null;
  const modal = ensureLaunchEditorModal();
  const body = document.getElementById('launchEditorModalBody');
  body.innerHTML = `
    <div class="modal-head">
      <div>
        <div class="muted small">${escapeHtml(currentItem.reportGroup || 'Продукт')} · ${escapeHtml(currentItem.launchMonth || 'Без месяца')}</div>
        <h2>${escapeHtml(currentItem.name || 'Новая новинка')}</h2>
        <div class="badge-stack">${currentItem.owner ? badge(currentItem.owner, 'info') : badge('Без owner', 'warn')}${badge(currentItem.status || 'Черновик', 'info')}</div>
      </div>
      <button class="btn ghost" type="button" data-close-launch-editor>Закрыть</button>
    </div>

    <datalist id="launchEditorOwnerList">${owners.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
    <datalist id="launchEditorSkuList">${skuOptions.map((entry) => `<option value="${escapeHtml(entry.articleKey)}">${escapeHtml(launchSkuSuggestionLabel(entry))}</option>`).join('')}</datalist>

    <form id="launchEditorForm" class="form-grid compact">
      <input type="hidden" name="id" value="${escapeHtml(currentItem.id)}">
      <label style="display:grid; gap:6px"><span class="muted small">Новинка</span><input name="name" value="${escapeHtml(currentItem.name || '')}" required></label>
      <label style="display:grid; gap:6px"><span class="muted small">Группа</span><input name="reportGroup" value="${escapeHtml(currentItem.reportGroup || '')}" required></label>
      <label style="display:grid; gap:6px"><span class="muted small">Тег</span><input name="tag" value="${escapeHtml(currentItem.tag || '')}"></label>
      <label style="display:grid; gap:6px"><span class="muted small">SKU bucket</span><input name="skuBucket" value="${escapeHtml(currentItem.skuBucket || '')}"></label>
      <label style="display:grid; gap:6px"><span class="muted small">Месяц запуска</span><input name="launchMonth" value="${escapeHtml(currentItem.launchMonth || '')}" required></label>
      <label style="display:grid; gap:6px"><span class="muted small">Точная дата</span><input name="launchDate" type="date" value="${escapeHtml(currentItem.launchDate || '')}"></label>
      <label style="display:grid; gap:6px"><span class="muted small">Статус</span><input name="status" value="${escapeHtml(currentItem.status || '')}"></label>
      <label style="display:grid; gap:6px"><span class="muted small">Производство</span><input name="production" value="${escapeHtml(currentItem.production || '')}"></label>
      <label style="display:grid; gap:6px"><span class="muted small">Owner</span><input name="owner" list="launchEditorOwnerList" value="${escapeHtml(currentItem.owner || '')}"></label>
      <label style="display:grid; gap:6px"><span class="muted small">Площадки</span><input name="marketplaces" value="${escapeHtml(currentItem.marketplaces || '')}"></label>
      <div class="card subtle launch-editor-registry" style="grid-column:1 / -1">
        <div class="section-subhead">
          <div>
            <h3>Связка с реестром SKU</h3>
            <p class="small muted">Если SKU уже есть в портале, выберите article_key и подтяните owner, категорию, статус в реестре и площадки. Если SKU ещё не завели, форму можно сохранить как есть и заполнить позже.</p>
          </div>
          <div class="badge-stack">
            ${currentItem.articleKey ? badge(currentItem.articleKey, 'ok') : badge('SKU пока не связано', 'warn')}
            ${linkedSku ? badge(linkedSku.article || linkedSku.articleKey, 'info') : ''}
          </div>
        </div>
        <div class="control-filters launch-editor-registry-grid" style="margin-top:12px">
          <label style="display:grid; gap:6px"><span class="muted small">Связка SKU (article_key)</span><input name="articleKey" list="launchEditorSkuList" value="${escapeHtml(currentItem.articleKey || '')}" placeholder="Например, telomeras_60caps"></label>
          <label style="display:grid; gap:6px"><span class="muted small">Артикул</span><input name="article" value="${escapeHtml(currentItem.article || '')}"></label>
          <label style="display:grid; gap:6px"><span class="muted small">Статус в SKU</span><input name="registryStatus" value="${escapeHtml(currentItem.registryStatus || '')}"></label>
        </div>
        <div class="quick-actions" style="margin-top:12px; justify-content:flex-start">
          <button class="btn ghost" type="button" data-launch-editor-apply-sku>Подтянуть из SKU</button>
          ${currentItem.articleKey ? '<button class="btn ghost" type="button" data-launch-editor-open-sku>Открыть SKU</button>' : ''}
        </div>
        ${skuSuggestions.length ? `
          <div class="launch-editor-suggestion-row" style="margin-top:12px">
            ${skuSuggestions.map((entry) => `
              <button class="quick-chip" type="button" data-launch-sku-suggest="${escapeHtml(entry.articleKey)}">${escapeHtml(launchSkuSuggestionLabel(entry))}</button>
            `).join('')}
          </div>
        ` : '<div class="muted small" style="margin-top:12px">Автоподсказок по SKU пока нет. Можно сохранить новинку и вернуться к связке позже.</div>'}
      </div>
      <label style="display:grid; gap:6px"><span class="muted small">Подкатегория</span><input name="subCategory" value="${escapeHtml(currentItem.subCategory || '')}"></label>
      <label style="display:grid; gap:6px"><span class="muted small">Категория</span><input name="category" value="${escapeHtml(currentItem.category || '')}"></label>
      <label style="display:grid; gap:6px"><span class="muted small">Презентация / ссылка</span><input name="presentationUrl" value="${escapeHtml(currentItem.presentationUrl || '')}" placeholder="https://..."></label>
      <label style="display:grid; gap:6px; grid-column:1 / -1"><span class="muted small">Характеристика</span><textarea name="characteristic" rows="3">${escapeHtml(currentItem.characteristic || '')}</textarea></label>
      <label style="display:grid; gap:6px; grid-column:1 / -1"><span class="muted small">Заметки</span><textarea name="notes" rows="4">${escapeHtml(currentItem.notes || '')}</textarea></label>

      <label style="display:grid; gap:6px"><span class="muted small">Целевая себестоимость</span><input name="targetCost" value="${escapeHtml(currentItem.targetCost ?? '')}"></label>
      <label style="display:grid; gap:6px"><span class="muted small">СРЦ без НДС</span><input name="srcWithoutVat" value="${escapeHtml(currentItem.srcWithoutVat ?? '')}"></label>
      <label style="display:grid; gap:6px"><span class="muted small">СРЦ с НДС</span><input name="srcWithVat" value="${escapeHtml(currentItem.srcWithVat ?? '')}"></label>
      <label style="display:grid; gap:6px"><span class="muted small">СРЦ со СПП 28</span><input name="srcWithSpp28" value="${escapeHtml(currentItem.srcWithSpp28 ?? '')}"></label>
      <label style="display:grid; gap:6px"><span class="muted small">Δ МРЦ</span><input name="mrpDeltaPct" value="${escapeHtml(currentItem.mrpDeltaPct ?? '')}"></label>
      <label style="display:grid; gap:6px"><span class="muted small">РРЦ с НДС</span><input name="rrpWithVat" value="${escapeHtml(currentItem.rrpWithVat ?? '')}"></label>
      <label style="display:grid; gap:6px"><span class="muted small">МРЦ с НДС</span><input name="mrpWithVat" value="${escapeHtml(currentItem.mrpWithVat ?? '')}"></label>
      <label style="display:grid; gap:6px"><span class="muted small">Маржа %</span><input name="grossMarginPct" value="${escapeHtml(currentItem.grossMarginPct ?? '')}"></label>
      <label style="display:grid; gap:6px"><span class="muted small">Маржа ₽</span><input name="grossMarginRub" value="${escapeHtml(currentItem.grossMarginRub ?? '')}"></label>
      <label style="display:grid; gap:6px"><span class="muted small">Якорная выручка</span><input name="revenueAnchor" value="${escapeHtml(currentItem.revenueAnchor ?? '')}"></label>
      <label style="display:grid; gap:6px"><span class="muted small">План за год</span><input name="yearlyPlanValue" value="${escapeHtml(currentItem.yearlyPlanValue ?? '')}"></label>

      <div class="card subtle" style="grid-column:1 / -1">
        <h3>План выручки</h3>
        <div class="control-filters" style="margin-top:12px">${revenuePlan.map((entry, index) => `
          <label style="display:grid; gap:6px"><span class="muted small">${escapeHtml(entry.label)}</span><input name="revenuePlan__${index}" value="${escapeHtml(entry.value ?? '')}"></label>
        `).join('')}</div>
      </div>

      <div class="card subtle" style="grid-column:1 / -1">
        <h3>План запуска</h3>
        <div class="control-filters" style="margin-top:12px">${launchPlan.map((entry, index) => `
          <label style="display:grid; gap:6px"><span class="muted small">${escapeHtml(entry.label)}</span><input name="launchPlan__${index}" value="${escapeHtml(entry.value ?? '')}"></label>
        `).join('')}</div>
      </div>

      <div class="card subtle" style="grid-column:1 / -1">
        <h3>Gantt</h3>
        <div class="control-filters" style="margin-top:12px">${ganttColumns.map((column) => `
          <label class="chip ${activeGantt.has(column.monthKey) ? 'info' : ''}" style="display:flex; gap:8px; align-items:center; justify-content:flex-start;">
            <input type="checkbox" name="gantt__${column.monthKey}" ${activeGantt.has(column.monthKey) ? 'checked' : ''}>
            <span>${escapeHtml(`${column.label} ${column.year}`)}</span>
          </label>
        `).join('')}</div>
      </div>

      <div class="quick-actions" style="grid-column:1 / -1; justify-content:flex-end">
        <button class="btn ghost" type="button" data-launch-editor-task>Поставить задачу</button>
        <button class="btn ghost" type="button" data-launch-editor-delete>Убрать из портала</button>
        <button class="btn primary" type="submit">Сохранить</button>
      </div>
    </form>
  `;

  modal.classList.add('open');

  body.querySelector('[data-close-launch-editor]')?.addEventListener('click', closeLaunchEditor);
  const form = body.querySelector('#launchEditorForm');
  const articleKeyField = form?.elements.namedItem('articleKey');
  const syncSkuToForm = (force = false) => {
    const articleKey = String(articleKeyField?.value || '').trim();
    if (!articleKey) return false;
    const sku = getSku(articleKey);
    if (!sku) return false;
    return applySkuToLaunchEditorForm(form, sku, { force });
  };
  articleKeyField?.addEventListener('change', () => {
    syncSkuToForm(false);
  });
  body.querySelector('[data-launch-editor-apply-sku]')?.addEventListener('click', () => {
    if (!syncSkuToForm(true)) window.alert('В реестре SKU пока нет такой связки. Можно сохранить новинку и вернуться к ней позже.');
  });
  body.querySelector('[data-launch-editor-open-sku]')?.addEventListener('click', () => {
    const articleKey = String(articleKeyField?.value || '').trim();
    if (!articleKey || typeof openSkuModal !== 'function') return;
    closeLaunchEditor();
    openSkuModal(articleKey);
  });
  body.querySelectorAll('[data-launch-sku-suggest]').forEach((button) => {
    button.addEventListener('click', () => {
      const sku = getSku(button.getAttribute('data-launch-sku-suggest') || '');
      if (!sku) return;
      applySkuToLaunchEditorForm(form, sku, { force: true });
    });
  });
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const draft = readLaunchEditorForm(event.currentTarget, currentItem, revenuePlan, launchPlan, ganttColumns);
    upsertLaunchDraft(draft);
    closeLaunchEditor();
    rerenderCurrentView();
  });
  body.querySelector('[data-launch-editor-delete]')?.addEventListener('click', () => {
    if (!window.confirm('Убрать эту новинку из портального слоя? Исходный файл это не тронет.')) return;
    deleteLaunchDraft(currentItem.id);
    closeLaunchEditor();
    rerenderCurrentView();
  });
  body.querySelector('[data-launch-editor-task]')?.addEventListener('click', async () => {
    const draft = readLaunchEditorForm(form, currentItem, revenuePlan, launchPlan, ganttColumns);
    upsertLaunchDraft(draft);
    closeLaunchEditor();
    rerenderCurrentView();
    await createOrOpenLaunchTask(normalizeLaunchItem(draft, { skipTaskLookup: true }));
  });
}

function productLeaderboardSignalMeta(signal) {
  const map = {
    leader: { label: 'КЗ работает', tone: 'ok' },
    steady: { label: 'Наблюдать', tone: 'info' },
    risk: { label: 'КЗ в риске', tone: 'warn' },
    no_owner: { label: 'Без owner', tone: 'danger' },
    no_sales: { label: 'КЗ без выкупов', tone: 'danger' }
  };
  return map[signal] || map.steady;
}

function productLeaderboardAlertTone(severity) {
  if (severity === 'critical') return 'danger';
  if (severity === 'high') return 'warn';
  if (severity === 'medium') return 'info';
  return '';
}

function productLeaderboardAlertRank(severity) {
  if (severity === 'critical') return 4;
  if (severity === 'high') return 3;
  if (severity === 'medium') return 2;
  return 1;
}

function normalizeProductLeaderboardAlert(alert = {}) {
  return {
    code: alert.code || '',
    family: alert.family || '',
    severity: alert.severity || 'info',
    title: alert.title || alert.label || 'Отклонение',
    label: alert.label || alert.title || 'Отклонение',
    metricKey: alert.metricKey || '',
    value: productLeaderboardRate(alert.value),
    baseline: productLeaderboardRate(alert.baseline),
    deltaPct: productLeaderboardRate(alert.deltaPct),
    hint: alert.hint || ''
  };
}

function normalizeProductLeaderboardDiagnostics(diagnostics = {}) {
  const alerts = Array.isArray(diagnostics.alerts)
    ? diagnostics.alerts.map(normalizeProductLeaderboardAlert)
    : [];
  alerts.sort((left, right) =>
    productLeaderboardAlertRank(right.severity) - productLeaderboardAlertRank(left.severity)
    || String(left.title || '').localeCompare(String(right.title || ''), 'ru')
  );
  return {
    healthScore: numberOrZero(diagnostics.healthScore),
    highestSeverity: diagnostics.highestSeverity || (alerts[0]?.severity || 'info'),
    alertCount: numberOrZero(diagnostics.alertCount || alerts.length),
    summary: diagnostics.summary || (alerts.length ? alerts.slice(0, 2).map((alert) => alert.label).join(' · ') : 'Без критичных отклонений'),
    alerts,
    metrics: diagnostics.metrics && typeof diagnostics.metrics === 'object' ? diagnostics.metrics : {}
  };
}

function productLeaderboardRate(value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return null;
  return Number(value);
}

function productLeaderboardSum(values) {
  return (Array.isArray(values) ? values : []).reduce((total, value) => total + numberOrZero(value), 0);
}

function productLeaderboardSummaryFromItems(items) {
  const list = Array.isArray(items) ? items : [];
  const summary = {
    skuCount: list.length,
    ownerCount: new Set(list.map((item) => String(item.owner || '').trim()).filter(Boolean)).size,
    reach: productLeaderboardSum(list.map((item) => item.reach || 0)),
    reactions: productLeaderboardSum(list.map((item) => item.reactions || 0)),
    posts: productLeaderboardSum(list.map((item) => item.posts || 0)),
    clicks: productLeaderboardSum(list.map((item) => item.clicks || 0)),
    carts: productLeaderboardSum(list.map((item) => item.carts || 0)),
    orders: productLeaderboardSum(list.map((item) => item.orders || 0)),
    buys: productLeaderboardSum(list.map((item) => item.buys || 0)),
    contentCost: productLeaderboardSum(list.map((item) => item.contentCost || 0)),
    revenue: productLeaderboardSum(list.map((item) => item.revenue || 0)),
    income: productLeaderboardSum(list.map((item) => item.income || 0))
  };

  summary.ctrPct = summary.reach > 0 ? summary.clicks / summary.reach : 0;
  summary.cartRatePct = summary.clicks > 0 ? summary.carts / summary.clicks : 0;
  summary.orderRatePct = summary.clicks > 0 ? summary.orders / summary.clicks : 0;
  summary.buyRatePct = summary.clicks > 0 ? summary.buys / summary.clicks : 0;
  summary.buyoutPct = summary.orders > 0 ? summary.buys / summary.orders : 0;
  summary.romiPct = summary.contentCost > 0 ? summary.income / summary.contentCost : 0;
  summary.drrPct = summary.revenue > 0 ? summary.contentCost / summary.revenue : 0;
  return summary;
}

function normalizeProductLeaderboardItem(item = {}) {
  const normalized = {
    id: item.id || stableId('product-leaderboard', item.articleKey || item.article || item.name || ''),
    brand: item.brand || 'АЛТЕЯ',
    weekLabel: item.weekLabel || '',
    articleKey: item.articleKey || '',
    article: item.article || '',
    name: item.name || item.articleKey || item.article || 'SKU',
    owner: item.owner || '',
    category: item.category || '',
    traffic: item.traffic || '',
    signal: item.signal || 'steady',
    inPortal: item.inPortal !== false,
    reach: numberOrZero(item.reach),
    reactions: numberOrZero(item.reactions),
    posts: numberOrZero(item.posts),
    clicks: numberOrZero(item.clicks),
    carts: numberOrZero(item.carts),
    orders: numberOrZero(item.orders),
    buys: numberOrZero(item.buys),
    itemCost: numberOrZero(item.itemCost),
    contentCost: numberOrZero(item.contentCost),
    revenue: numberOrZero(item.revenue),
    income: numberOrZero(item.income),
    erviewPct: productLeaderboardRate(item.erviewPct),
    ctrPct: productLeaderboardRate(item.ctrPct),
    conversionPct: productLeaderboardRate(item.conversionPct),
    ecpm: productLeaderboardRate(item.ecpm),
    grossEcpm: productLeaderboardRate(item.grossEcpm),
    romiPct: productLeaderboardRate(item.romiPct),
    drrPct: productLeaderboardRate(item.drrPct),
    buyRatePct: productLeaderboardRate(item.buyRatePct),
    buyoutPct: productLeaderboardRate(item.buyoutPct),
    cartRatePct: productLeaderboardRate(item.cartRatePct),
    diagnostics: normalizeProductLeaderboardDiagnostics(item.diagnostics || {})
  };
  normalized.cartRatePct = normalized.cartRatePct === null
    ? (normalized.clicks > 0 ? normalized.carts / normalized.clicks : 0)
    : normalized.cartRatePct;
  if (normalized.buyRatePct === null) normalized.buyRatePct = normalized.clicks > 0 ? normalized.buys / normalized.clicks : 0;
  if (normalized.buyoutPct === null) normalized.buyoutPct = normalized.orders > 0 ? normalized.buys / normalized.orders : 0;
  return normalized;
}

function normalizeProductLeaderboardPayload(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items.map(normalizeProductLeaderboardItem) : [];
  const summary = productLeaderboardSummaryFromItems(items);
  const sourceSummary = payload.summary || {};
  return {
    generatedAt: payload.generatedAt || '',
    sourceFile: payload.sourceFile || '',
    sourceGid: payload.sourceGid || '',
    sourceSheetName: payload.sourceSheetName || payload.weekLabel || '',
    weekLabel: payload.weekLabel || payload.sourceSheetName || '',
    sourceWeekFrom: payload.sourceWeekFrom || '',
    sourceWeekTo: payload.sourceWeekTo || '',
    sourceLagDays: payload.sourceLagDays == null ? null : numberOrZero(payload.sourceLagDays),
    freshnessStatus: payload.freshnessStatus || '',
    freshnessNote: payload.freshnessNote || '',
    brandFilter: payload.brandFilter || 'АЛТЕЯ',
    baselines: payload.baselines && typeof payload.baselines === 'object' ? payload.baselines : {},
    alertCounts: payload.alertCounts && typeof payload.alertCounts === 'object'
      ? {
          critical: numberOrZero(payload.alertCounts.critical),
          high: numberOrZero(payload.alertCounts.high),
          medium: numberOrZero(payload.alertCounts.medium),
          info: numberOrZero(payload.alertCounts.info)
        }
      : { critical: 0, high: 0, medium: 0, info: 0 },
    totals: payload.totals || {
      sourceRows: items.length,
      brandRows: items.length,
      matchedRows: items.length,
      unmatchedRows: 0
    },
    summary: {
      ...summary,
      ...sourceSummary
    },
    owners: Array.isArray(payload.owners) ? payload.owners.filter(Boolean) : [...new Set(items.map((item) => item.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
    categories: Array.isArray(payload.categories) ? payload.categories.filter(Boolean) : [...new Set(items.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
    items,
    unmatchedItems: Array.isArray(payload.unmatchedItems) ? payload.unmatchedItems.map(normalizeProductLeaderboardItem) : []
  };
}

function getProductLeaderboardEntry(articleKey, payload = state.productLeaderboard || {}) {
  const normalizedKey = String(articleKey || '').trim().toLowerCase();
  if (!normalizedKey) return null;
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items.find((item) => String(item.articleKey || '').trim().toLowerCase() === normalizedKey) || null;
}

function openProductLeaderboardForSku(articleKey = '') {
  const filters = getProductLeaderboardFilters();
  filters.search = articleKey || '';
  filters.owner = 'all';
  filters.signal = 'all';
  filters.category = 'all';
  filters.snapshot = 'latest';
  if (!filters.sort) filters.sort = 'buys';
  if (!filters.sortDir) filters.sortDir = 'desc';
  setView('product-leaderboard');
}

window.openProductLeaderboardForSku = openProductLeaderboardForSku;

function getProductLeaderboardFilters() {
  state.productLeaderboardFilters = state.productLeaderboardFilters || {};
  state.productLeaderboardFilters.search = state.productLeaderboardFilters.search || '';
  state.productLeaderboardFilters.owner = state.productLeaderboardFilters.owner || 'all';
  state.productLeaderboardFilters.category = state.productLeaderboardFilters.category || 'all';
  state.productLeaderboardFilters.signal = state.productLeaderboardFilters.signal || 'all';
  state.productLeaderboardFilters.sort = state.productLeaderboardFilters.sort || 'buys';
  state.productLeaderboardFilters.sortDir = state.productLeaderboardFilters.sortDir === 'asc' ? 'asc' : 'desc';
  state.productLeaderboardFilters.snapshot = state.productLeaderboardFilters.snapshot || 'latest';
  return state.productLeaderboardFilters;
}

function productLeaderboardHistoryPayloads() {
  const current = normalizeProductLeaderboardPayload(state.productLeaderboard || {});
  const history = Array.isArray(state.productLeaderboardHistory)
    ? state.productLeaderboardHistory.map((item) => normalizeProductLeaderboardPayload(item || {}))
    : [];
  const seen = new Set();
  return [current, ...history]
    .filter((item) => item.generatedAt || item.weekLabel || (item.items || []).length)
    .filter((item) => {
      const key = String(item.generatedAt || item.weekLabel || '').trim();
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => parseFreshStamp(right.generatedAt || right.weekLabel) - parseFreshStamp(left.generatedAt || left.weekLabel));
}

function currentProductLeaderboardPayload() {
  const filters = getProductLeaderboardFilters();
  const snapshots = productLeaderboardHistoryPayloads();
  if (filters.snapshot !== 'latest') {
    const matched = snapshots.find((item) => item.generatedAt === filters.snapshot);
    if (matched) return matched;
    filters.snapshot = 'latest';
  }
  return snapshots[0] || normalizeProductLeaderboardPayload(state.productLeaderboard || {});
}

function productLeaderboardSnapshotLabel(payload) {
  const weekLabel = payload.weekLabel || payload.sourceSheetName || 'Срез';
  const generatedAt = payload.generatedAt ? fmt.date(payload.generatedAt) : 'без даты';
  return `${weekLabel} · выгружено ${generatedAt}`;
}

function productLeaderboardWeekRange(label = '') {
  const match = String(label || '').match(/(\d{2})\.(\d{2})\.(\d{4})\s*[-–]\s*(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return null;
  const startKey = `${match[3]}-${match[2]}-${match[1]}`;
  const endKey = `${match[6]}-${match[5]}-${match[4]}`;
  return {
    startKey,
    endKey,
    startStamp: parseFreshStamp(startKey),
    endStamp: parseFreshStamp(endKey)
  };
}

function productLeaderboardDateLabel(dateKey = '') {
  const stamp = parseFreshStamp(dateKey);
  if (!stamp) return '—';
  return new Date(stamp).toLocaleDateString('ru-RU');
}

function productLeaderboardFreshnessMeta(payload = {}) {
  const weekRange = productLeaderboardWeekRange(payload.weekLabel || payload.sourceSheetName || '');
  const generatedStamp = parseFreshStamp(payload.generatedAt || '');
  const referenceStamp = weekRange?.endStamp || generatedStamp;
  const ageDays = referenceStamp ? Math.max(0, Math.floor((Date.now() - referenceStamp) / 86400000)) : null;
  const status = !referenceStamp
    ? 'unknown'
    : weekRange
      ? (ageDays > 10 ? 'stale' : ageDays > 3 ? 'aging' : 'fresh')
      : (ageDays > 14 ? 'stale' : ageDays > 7 ? 'aging' : 'fresh');
  const tone = status === 'stale' ? 'danger' : status === 'aging' ? 'warn' : status === 'fresh' ? 'ok' : 'info';
  const badgeLabel = status === 'stale'
    ? `Неделя устарела на ${fmt.int(ageDays)} дн.`
    : status === 'aging'
      ? `Неделя отстаёт на ${fmt.int(ageDays)} дн.`
      : status === 'fresh'
        ? 'Неделя актуальна'
        : 'Нет даты недели';
  const summaryLine = weekRange
    ? `Внутри лидерборда сейчас неделя ${payload.weekLabel || payload.sourceSheetName || 'без подписи'}; её конец — ${productLeaderboardDateLabel(weekRange.endKey)}.`
    : `Внутри лидерборда нет читаемой подписи недели; ориентируемся на техническую дату выгрузки ${payload.generatedAt ? fmt.date(payload.generatedAt) : 'без даты'}.`;
  const technicalLine = payload.generatedAt && weekRange && generatedStamp > weekRange.endStamp
    ? `Файл пересобирали ${fmt.date(payload.generatedAt)}, но контент остался из этой недели.`
    : (payload.generatedAt ? `Техническая выгрузка: ${fmt.date(payload.generatedAt)}.` : '');
  const actionLine = weekRange
    ? `Перед решениями по КЗ сверяйте weekly sheet и gid ${payload.sourceGid || 'источника'}, если нужна неделя после ${productLeaderboardDateLabel(weekRange.endKey)}.`
    : 'Если лидерборд должен быть операционным, источнику нужна читаемая недельная подпись.';
  return {
    status,
    tone,
    ageDays,
    weekRange,
    badgeLabel,
    summaryLine,
    technicalLine,
    actionLine
  };
}

function productLeaderboardExportRows(items, payload) {
  return items.map((item) => ({
    week_label: payload.weekLabel || payload.sourceSheetName || '',
    generated_at: payload.generatedAt || '',
    article_key: item.articleKey || '',
    article: item.article || '',
    name: item.name || '',
    owner: item.owner || '',
    category: item.category || '',
    traffic: item.traffic || '',
    signal: productLeaderboardSignalMeta(item.signal).label,
    reach: item.reach,
    clicks: item.clicks,
    carts: item.carts,
    orders: item.orders,
    buys: item.buys,
    ctr_pct: item.ctrPct === null ? '' : item.ctrPct,
    cart_rate_pct: item.cartRatePct === null ? '' : item.cartRatePct,
    buyout_pct: item.buyoutPct === null ? '' : item.buyoutPct,
    revenue: item.revenue,
    income: item.income,
    romi_pct: item.romiPct === null ? '' : item.romiPct,
    drr_pct: item.drrPct === null ? '' : item.drrPct,
    diagnostics: item.diagnostics?.summary || ''
  }));
}

function downloadProductLeaderboardExcel(payload, items) {
  const rows = productLeaderboardExportRows(items, payload);
  if (!rows.length) {
    window.alert('По текущим фильтрам нет строк для выгрузки.');
    return;
  }
  downloadLaunchesHtmlTable([
    ['week_label', 'Неделя'],
    ['generated_at', 'Выгружено'],
    ['article_key', 'Article key'],
    ['article', 'Артикул'],
    ['name', 'Товар'],
    ['owner', 'Owner'],
    ['category', 'Категория'],
    ['traffic', 'Трафик'],
    ['signal', 'Сигнал'],
    ['reach', 'Охваты'],
    ['clicks', 'Клики'],
    ['carts', 'Корзины'],
    ['orders', 'Заказы'],
    ['buys', 'Выкупы'],
    ['ctr_pct', 'CTR'],
    ['cart_rate_pct', 'CR в корзину'],
    ['buyout_pct', 'Выкуп'],
    ['revenue', 'Выручка'],
    ['income', 'Доход'],
    ['romi_pct', 'ROMI'],
    ['drr_pct', 'ДРР'],
    ['diagnostics', 'Комментарий']
  ], rows, `product-leaderboard-${todayIso()}.xls`);
}

function getFilteredProductLeaderboardItems(payload) {
  const filters = getProductLeaderboardFilters();
  const search = String(filters.search || '').trim().toLowerCase();
  const filtered = (payload.items || []).filter((item) => {
    if (filters.owner !== 'all' && item.owner !== filters.owner) return false;
    if (filters.category !== 'all' && item.category !== filters.category) return false;
    if (filters.signal !== 'all' && item.signal !== filters.signal) return false;
    if (!search) return true;
    const haystack = [
      item.articleKey,
      item.article,
      item.name,
      item.owner,
      item.category,
      item.traffic
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(search);
  });

  const sortKey = filters.sort || 'buys';
  const sortDir = filters.sortDir === 'asc' ? 'asc' : 'desc';
  const directionFactor = sortDir === 'asc' ? 1 : -1;
  const emptyMetric = sortDir === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  const getMetric = (item) => {
    const raw = item?.[sortKey];
    if (raw === null || raw === undefined || raw === '') return emptyMetric;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : emptyMetric;
  };

  return filtered.sort((left, right) => {
    const leftMetric = getMetric(left);
    const rightMetric = getMetric(right);
    return (leftMetric - rightMetric) * directionFactor
      || right.buys - left.buys
      || left.name.localeCompare(right.name, 'ru');
  });
}

function renderProductLeaderboard(rootId = 'view-product-leaderboard') {
  const root = document.getElementById(rootId);
  state.productLeaderboard = normalizeProductLeaderboardPayload(state.productLeaderboard || {});
  const payload = currentProductLeaderboardPayload();
  const freshness = productLeaderboardFreshnessMeta(payload);
  const filters = getProductLeaderboardFilters();
  const filteredItems = getFilteredProductLeaderboardItems(payload);
  const filteredSummary = productLeaderboardSummaryFromItems(filteredItems);
  const ownerCoverage = filteredSummary.skuCount > 0 ? filteredSummary.ownerCount / filteredSummary.skuCount : 0;
  const snapshots = productLeaderboardHistoryPayloads();
  const historyOptions = snapshots.slice(1);
  const historyCards = snapshots.slice(0, 6).map((snapshot) => {
    const snapshotSummary = productLeaderboardSummaryFromItems(snapshot.items || []);
    const snapshotFreshness = productLeaderboardFreshnessMeta(snapshot);
    return `
      <div class="list-item">
        <div class="head">
          <div>
            <strong>${escapeHtml(productLeaderboardSnapshotLabel(snapshot))}</strong>
            <div class="muted small">${escapeHtml(snapshot.sourceSheetName || 'weekly КЗ-лист')} · ${fmt.int(snapshotSummary.skuCount)} SKU</div>
          </div>
          <div class="badge-stack">
            ${badge(snapshotFreshness.badgeLabel, snapshotFreshness.tone)}
            ${badge(`Охваты ${fmt.int(snapshotSummary.reach)}`, 'info')}
            ${badge(`Клики ${fmt.int(snapshotSummary.clicks)}`, 'info')}
            ${badge(`Корзины ${fmt.int(snapshotSummary.carts)}`, 'info')}
          </div>
        </div>
        <div class="muted small" style="margin-top:8px">Выручка ${fmt.money(snapshotSummary.revenue)} · ROMI ${fmt.pct(snapshotSummary.romiPct)} · ДРР ${fmt.pct(snapshotSummary.drrPct)}</div>
      </div>
    `;
  }).join('');
  const freshnessBanner = freshness.status === 'fresh' ? '' : `
    <div class="card subtle" style="margin-bottom:14px; border-left:4px solid ${freshness.status === 'stale' ? 'var(--danger, #c44)' : 'var(--warn, #d18b00)'}">
      <div class="section-subhead">
        <div>
          <h3>${freshness.status === 'stale' ? 'Лидерборд требует обновления источника' : 'Лидерборд начинает отставать'}</h3>
          <p class="small muted">${escapeHtml(freshness.summaryLine)}</p>
        </div>
        <div class="badge-stack">${badge(freshness.badgeLabel, freshness.tone)}</div>
      </div>
      <div class="muted small" style="margin-top:10px">${escapeHtml(freshness.technicalLine || freshness.actionLine)}</div>
      ${freshness.technicalLine ? `<div class="muted small" style="margin-top:6px">${escapeHtml(freshness.actionLine)}</div>` : ''}
    </div>
  `;
  const sortIndicator = (key) => {
    if (filters.sort !== key) return '';
    return filters.sortDir === 'asc' ? ' ↑' : ' ↓';
  };
  const sortHeader = (label, key) => `
    <th
      data-product-sort="${escapeHtml(key)}"
      style="cursor:pointer;user-select:none"
      title="Сортировка как в Excel: первый клик по колонке — от большего к меньшему, второй — в обратную сторону."
    >${escapeHtml(label)}${sortIndicator(key)}</th>
  `;

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Продуктовый лидерборд</h2>
        <p>Единый недельный продуктовый срез: сверху общая воронка и история выгрузок, ниже SKU с охватами, кликами, корзинами, экономикой и рисками.</p>
      </div>
      <div class="badge-stack">
        ${badge(payload.weekLabel || 'недельный срез', 'info')}
        ${badge(freshness.badgeLabel, freshness.tone)}
        ${badge(`${fmt.int(filteredSummary.skuCount)} SKU`, filteredSummary.skuCount ? 'info' : 'warn')}
        ${badge(`${fmt.int(payload.totals.unmatchedRows || 0)} вне портала`, payload.totals.unmatchedRows ? 'warn' : 'ok')}
        ${badge(`${fmt.int(payload.alertCounts.critical || 0)} крит. откл.`, payload.alertCounts.critical ? 'danger' : 'ok')}
      </div>
    </div>

    ${freshnessBanner}

    <div class="kpi-strip">
      <div class="mini-kpi"><span>Охваты</span><strong>${fmt.int(filteredSummary.reach)}</strong><span>верх воронки</span></div>
      <div class="mini-kpi"><span>Клики</span><strong>${fmt.int(filteredSummary.clicks)}</strong><span>CTR ${fmt.pct(filteredSummary.ctrPct)}</span></div>
      <div class="mini-kpi"><span>Корзины</span><strong>${fmt.int(filteredSummary.carts)}</strong><span>из кликов ${fmt.pct(filteredSummary.cartRatePct)}</span></div>
      <div class="mini-kpi"><span>Заказы</span><strong>${fmt.int(filteredSummary.orders)}</strong><span>из кликов ${fmt.pct(filteredSummary.orderRatePct)}</span></div>
      <div class="mini-kpi"><span>Выкупы</span><strong>${fmt.int(filteredSummary.buys)}</strong><span>buyout ${fmt.pct(filteredSummary.buyoutPct)}</span></div>
      <div class="mini-kpi"><span>Выручка / доход</span><strong>${fmt.money(filteredSummary.revenue)}</strong><span>${fmt.money(filteredSummary.income)}</span></div>
    </div>

    <div class="card">
      <div class="section-subhead">
        <div>
          <h3>Итог недели по КЗ</h3>
          <p class="small muted">Источник: ${escapeHtml(payload.sourceSheetName || 'weekly КЗ-лист')} · обновлено ${escapeHtml(fmt.date(payload.generatedAt))}</p>
        </div>
        <div class="badge-stack">
          ${badge(`ROMI ${fmt.pct(filteredSummary.romiPct)}`, filteredSummary.romiPct >= 2 ? 'ok' : filteredSummary.romiPct >= 1 ? 'info' : 'warn')}
          ${badge(`ДРР ${fmt.pct(filteredSummary.drrPct)}`, filteredSummary.drrPct <= 0.3 ? 'ok' : filteredSummary.drrPct <= 0.4 ? 'info' : 'warn')}
          ${badge(`Owner coverage ${fmt.pct(ownerCoverage)}`, ownerCoverage >= 0.95 ? 'ok' : 'warn')}
          ${badge(`Критичных ${fmt.int(payload.alertCounts.critical || 0)}`, payload.alertCounts.critical ? 'danger' : 'ok')}
        </div>
      </div>
      <div class="quick-actions" style="margin-top:12px">
        ${badge(`Отклик ${fmt.int(filteredSummary.reactions)}`, 'info')}
        ${badge(`Публикации ${fmt.int(filteredSummary.posts)}`, '')}
        ${badge(`Контент ${fmt.money(filteredSummary.contentCost)}`, filteredSummary.contentCost ? 'warn' : '')}
        ${badge(`Доход ${fmt.money(filteredSummary.income)}`, filteredSummary.income > 0 ? 'ok' : 'warn')}
        ${badge(`Buy rate ${fmt.pct(filteredSummary.buyRatePct)}`, 'info')}
        ${badge(`High alerts ${fmt.int(payload.alertCounts.high || 0)}`, payload.alertCounts.high ? 'warn' : '')}
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Фильтры и выгрузка</h3>
          <p class="small muted">Фильтруем по owner, категории, сигналу и нужному срезу. Выгрузка в Excel берёт уже отфильтрованный список.</p>
        </div>
        <div class="quick-actions">
          <button class="quick-chip" type="button" data-product-leaderboard-export>Выгрузить в Excel</button>
        </div>
      </div>
      <div class="control-filters" style="margin-top:12px">
        <input id="productLeaderboardSearch" placeholder="Поиск по SKU, названию, owner, категории…" value="${escapeHtml(filters.search)}">
        <select id="productLeaderboardSnapshot">
          <option value="latest" ${filters.snapshot === 'latest' ? 'selected' : ''}>Текущий срез</option>
          ${historyOptions.map((snapshot) => `<option value="${escapeHtml(snapshot.generatedAt)}" ${filters.snapshot === snapshot.generatedAt ? 'selected' : ''}>${escapeHtml(productLeaderboardSnapshotLabel(snapshot))}</option>`).join('')}
        </select>
        <select id="productLeaderboardOwner">
          <option value="all" ${filters.owner === 'all' ? 'selected' : ''}>Все owner</option>
          ${payload.owners.map((owner) => `<option value="${escapeHtml(owner)}" ${filters.owner === owner ? 'selected' : ''}>${escapeHtml(owner)}</option>`).join('')}
        </select>
        <select id="productLeaderboardCategory">
          <option value="all" ${filters.category === 'all' ? 'selected' : ''}>Все категории</option>
          ${payload.categories.map((category) => `<option value="${escapeHtml(category)}" ${filters.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}
        </select>
        <select id="productLeaderboardSignal">
          <option value="all" ${filters.signal === 'all' ? 'selected' : ''}>Все сигналы</option>
          ${['leader', 'steady', 'risk', 'no_owner', 'no_sales'].map((signal) => `<option value="${signal}" ${filters.signal === signal ? 'selected' : ''}>${escapeHtml(productLeaderboardSignalMeta(signal).label)}</option>`).join('')}
        </select>
        <select id="productLeaderboardSort">
          <option value="reach" ${filters.sort === 'reach' ? 'selected' : ''}>Сортировка: охваты</option>
          <option value="clicks" ${filters.sort === 'clicks' ? 'selected' : ''}>Сортировка: клики</option>
          <option value="carts" ${filters.sort === 'carts' ? 'selected' : ''}>Сортировка: корзины</option>
          <option value="buys" ${filters.sort === 'buys' ? 'selected' : ''}>Сортировка: выкупы</option>
          <option value="orders" ${filters.sort === 'orders' ? 'selected' : ''}>Сортировка: заказы</option>
          <option value="revenue" ${filters.sort === 'revenue' ? 'selected' : ''}>Сортировка: выручка</option>
          <option value="income" ${filters.sort === 'income' ? 'selected' : ''}>Сортировка: доход</option>
          <option value="romiPct" ${filters.sort === 'romiPct' ? 'selected' : ''}>Сортировка: ROMI</option>
          <option value="ctrPct" ${filters.sort === 'ctrPct' ? 'selected' : ''}>Сортировка: CTR</option>
          <option value="drrPct" ${filters.sort === 'drrPct' ? 'selected' : ''}>Сортировка: ДРР</option>
          <option value="buyoutPct" ${filters.sort === 'buyoutPct' ? 'selected' : ''}>Сортировка: выкуп</option>
        </select>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>История логов</h3>
          <p class="small muted">Здесь остаются прошлые выгрузки и пересборки недели. Даже если источник не сменился, видно когда обновляли данные и как выглядел верх воронки.</p>
        </div>
        ${badge(`${fmt.int(snapshots.length)} логов`, snapshots.length ? 'info' : 'ok')}
      </div>
      <div class="list" style="margin-top:12px">${historyCards || '<div class="empty">История выгрузок пока не накопилась.</div>'}</div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>SKU и воронка</h3>
          <p class="small muted">Охваты, клики и корзины вынесены в отдельные столбцы сверху, чтобы продукт видел рабочую воронку без открытия каждой карточки.</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(filteredItems.filter((item) => item.signal === 'leader').length)} КЗ работает`, filteredItems.some((item) => item.signal === 'leader') ? 'ok' : '')}
          ${badge(`${fmt.int(filteredItems.filter((item) => item.signal === 'risk').length)} в риске`, filteredItems.some((item) => item.signal === 'risk') ? 'warn' : 'ok')}
        </div>
      </div>
      <div class="table-wrap" style="margin-top:12px">
        <table>
          <thead>
            <tr>
              <th>SKU / товар</th>
              <th>Owner</th>
              ${sortHeader('Охваты', 'reach')}
              ${sortHeader('Клики', 'clicks')}
              ${sortHeader('Корзины', 'carts')}
              ${sortHeader('Заказы', 'orders')}
              ${sortHeader('Выкупы', 'buys')}
              ${sortHeader('CTR', 'ctrPct')}
              ${sortHeader('CR', 'conversionPct')}
              ${sortHeader('ROMI', 'romiPct')}
              ${sortHeader('ДРР', 'drrPct')}
              ${sortHeader('Выручка', 'revenue')}
              ${sortHeader('Доход', 'income')}
            </tr>
          </thead>
          <tbody>
            ${filteredItems.map((item) => {
              const signalMeta = productLeaderboardSignalMeta(item.signal);
              const topAlerts = (item.diagnostics?.alerts || []).slice(0, 2);
              return `
                <tr>
                  <td>
                    <div><strong>${item.articleKey ? linkToSku(item.articleKey, item.articleKey) : escapeHtml(item.article || item.name)}</strong></div>
                    <div class="muted small">${escapeHtml(item.name)}</div>
                    <div class="badge-stack" style="margin-top:8px">
                      ${badge(signalMeta.label, signalMeta.tone)}
                      ${item.category ? badge(item.category, '') : ''}
                      ${item.traffic ? badge(item.traffic, 'info') : ''}
                      ${topAlerts.map((alert) => badge(alert.label, productLeaderboardAlertTone(alert.severity))).join('')}
                    </div>
                    <div class="muted small" style="margin-top:8px">${escapeHtml(item.diagnostics?.summary || 'Без критичных отклонений')}</div>
                  </td>
                  <td>
                    <div>${item.owner ? badge(item.owner, 'info') : badge('Без owner', 'warn')}</div>
                    <div class="muted small" style="margin-top:8px">${item.article ? escapeHtml(item.article) : '—'}</div>
                  </td>
                  <td>${fmt.int(item.reach)}</td>
                  <td>${fmt.int(item.clicks)}</td>
                  <td>${fmt.int(item.carts)}</td>
                  <td>${fmt.int(item.orders)}</td>
                  <td>${fmt.int(item.buys)}</td>
                  <td>${fmt.pct(item.ctrPct)}</td>
                  <td>${fmt.pct(item.conversionPct)}</td>
                  <td>${fmt.pct(item.romiPct)}</td>
                  <td>${fmt.pct(item.drrPct)}</td>
                  <td>${fmt.money(item.revenue)}</td>
                  <td>${fmt.money(item.income)}</td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="13"><div class="empty">По текущим фильтрам пока нет строк.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    ${payload.unmatchedItems.length ? `
      <div class="card" style="margin-top:14px">
        <div class="section-subhead">
          <div>
            <h3>Что не сматчилось с порталом</h3>
            <p class="small muted">Эти строки пришли из weekly КЗ-листа, но пока не совпали с нашим articleKey.</p>
          </div>
          ${badge(`${fmt.int(payload.unmatchedItems.length)} строк`, 'warn')}
        </div>
        <div class="list" style="margin-top:12px">
          ${payload.unmatchedItems.slice(0, 8).map((item) => `
            <div class="list-item">
              <div class="head">
                <div>
                  <strong>${escapeHtml(item.articleKey || item.article || item.name)}</strong>
                  <div class="muted small">${escapeHtml(item.name || 'Без названия')}</div>
                </div>
                <div class="badge-stack">${badge('Нет в data/skus.json', 'warn')}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;

  root.querySelector('#productLeaderboardSearch')?.addEventListener('input', (event) => {
    getProductLeaderboardFilters().search = event.target.value;
    rerenderCurrentView();
  });
  root.querySelector('#productLeaderboardSnapshot')?.addEventListener('change', (event) => {
    getProductLeaderboardFilters().snapshot = event.target.value;
    rerenderCurrentView();
  });
  root.querySelector('#productLeaderboardOwner')?.addEventListener('change', (event) => {
    getProductLeaderboardFilters().owner = event.target.value;
    rerenderCurrentView();
  });
  root.querySelector('#productLeaderboardCategory')?.addEventListener('change', (event) => {
    getProductLeaderboardFilters().category = event.target.value;
    rerenderCurrentView();
  });
  root.querySelector('#productLeaderboardSignal')?.addEventListener('change', (event) => {
    getProductLeaderboardFilters().signal = event.target.value;
    rerenderCurrentView();
  });
  root.querySelector('#productLeaderboardSort')?.addEventListener('change', (event) => {
    getProductLeaderboardFilters().sort = event.target.value;
    getProductLeaderboardFilters().sortDir = 'desc';
    rerenderCurrentView();
  });
  root.querySelectorAll('[data-product-sort]').forEach((cell) => {
    cell.addEventListener('click', () => {
      const nextSort = String(cell.getAttribute('data-product-sort') || '').trim();
      if (!nextSort) return;
      const productFilters = getProductLeaderboardFilters();
      if (productFilters.sort === nextSort) {
        productFilters.sortDir = productFilters.sortDir === 'desc' ? 'asc' : 'desc';
      } else {
        productFilters.sort = nextSort;
        productFilters.sortDir = 'desc';
      }
      rerenderCurrentView();
    });
  });
  root.querySelector('[data-product-leaderboard-export]')?.addEventListener('click', () => {
    downloadProductLeaderboardExcel(payload, filteredItems);
  });
}

function renderLaunchItem(item) {
  const phaseMeta = launchPhaseMeta(item.phase);
  const daysUntil = launchDaysUntil(item);
  const timingLabel = !Number.isFinite(daysUntil)
    ? 'без точной даты'
    : daysUntil < 0
      ? `в запуске ${fmt.int(Math.abs(daysUntil))} дн.`
      : `до запуска ${fmt.int(daysUntil)} дн.`;
  const ganttPreview = (item.ganttMonths || [])
    .slice(0, 4)
    .map((entry) => `${entry.label} ${entry.year}`)
    .join(' · ');
  const hasPresentation = launchHasPresentation(item);
  const hasGantt = launchHasGantt(item);
  const sourceMeta = [item.sourceFile, item.sourceRow ? `строка ${item.sourceRow}` : ''].filter(Boolean).join(' · ');
  return `
    <div class="list-item launch-card">
      <div class="head launch-card-head">
        <div>
          <strong>${item.articleKey ? linkToSku(item.articleKey, item.name || 'Новинка') : escapeHtml(item.name || 'Новинка')}</strong>
          <div class="muted small">${escapeHtml(item.reportGroup || '—')} · ${escapeHtml(item.subCategory || '—')} · ${escapeHtml(launchDueDateLabel(item))}</div>
        </div>
        <div class="badge-stack">
          ${badge(phaseMeta.label, phaseMeta.tone)}
          ${badge(timingLabel, Number.isFinite(daysUntil) && daysUntil <= 14 ? 'warn' : 'info')}
        </div>
      </div>
      <div class="badge-stack">
        ${item.owner ? badge(item.owner, 'info') : badge('Без owner', 'warn')}
        ${item.production ? badge(item.production, '') : ''}
        ${item.marketplaces ? badge(item.marketplaces, '') : badge('Площадки не указаны', 'warn')}
        ${item.articleMatched ? badge('Есть в SKU', 'ok') : badge('Нет связки с SKU', 'warn')}
        ${hasPresentation ? badge('Материалы есть', 'ok') : badge('Нет презентации', 'warn')}
        ${hasGantt ? badge('Gantt есть', 'ok') : badge('Нет gantt', 'warn')}
      </div>
      <div class="muted small launch-source-line" style="margin-top:8px">${escapeHtml(sourceMeta || 'Источник: портал')}</div>
      <div class="muted small" style="margin-top:8px">${escapeHtml(item.status || 'Статус не указан')}</div>
      <div class="muted small launch-card-metrics" style="margin-top:8px">План выручки ${fmt.money(item.plannedRevenue)} · Целевая себестоимость ${fmt.money(item.targetCost)} · Активных задач ${fmt.int(item.activeTasks || 0)}</div>
      ${!item.articleMatched && item.skuSuggestions?.length ? `<div class="muted small" style="margin-top:8px">Подсказка по SKU: ${escapeHtml(item.skuSuggestions.map((entry) => entry.articleKey).join(', '))}</div>` : ''}
      <div class="muted small" style="margin-top:8px">${escapeHtml(item.characteristic || 'Описание по новинке пока не заполнено')}</div>
      ${item.notes ? `<div class="muted small" style="margin-top:8px">${escapeHtml(item.notes)}</div>` : ''}
      <div class="muted small" style="margin-top:8px">Gantt: ${escapeHtml(ganttPreview || 'месяцы в плане пока не отмечены')}</div>
      <div class="quick-actions launch-card-actions" style="margin-top:10px; justify-content:flex-start">
        <button class="quick-chip" type="button" data-launch-edit="${escapeHtml(item.id)}">Редактировать</button>
        <button class="quick-chip portal-action-primary" type="button" data-launch-task="${escapeHtml(item.id)}">${item.activeTasks ? 'Открыть задачу' : 'Поставить задачу'}</button>
        ${item.presentationUrl ? launchLinkHtml(item.presentationUrl) : ''}
      </div>
      <div class="badge-stack" style="margin-top:8px">${(item.blockers || []).slice(0, 4).map((text) => badge(text, 'warn')).join('') || badge('Блокеры не найдены', 'ok')}</div>
    </div>
  `;
}

function bindLaunchItemActions(root) {
  root.querySelectorAll('[data-launch-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      openLaunchEditor(button.getAttribute('data-launch-edit') || '');
    });
  });
  root.querySelectorAll('[data-launch-task]').forEach((button) => {
    button.addEventListener('click', async () => {
      const launchId = button.getAttribute('data-launch-task') || '';
      const item = getLaunchItems({ skipTaskLookup: true }).find((entry) => entry.id === launchId);
      if (!item) return;
      await createOrOpenLaunchTask(item);
    });
  });
}

function renderLaunches() {
  const root = document.getElementById('view-launches');
  const model = getLaunchViewModel();
  const registryLinked = model.filteredItems.filter((item) => item.articleMatched).length;
  const withoutOwner = model.filteredItems.filter((item) => !item.owner).length;
  const withBlockers = model.filteredItems.filter((item) => (item.blockers || []).length).length;
  const activeTasksTotal = model.filteredItems.reduce((total, item) => total + numberOrZero(item.activeTasks), 0);
  const sourceLabel = model.sourceFiles[0] || 'Портальные черновики';
  const ganttExpanded = launchGanttExpanded();
  const ganttRows = model.filteredItems.slice(0, 12).map((item) => `
    <tr>
      <td>
        <div><strong>${item.articleKey ? linkToSku(item.articleKey, item.name || item.articleKey) : escapeHtml(item.name || 'Новинка')}</strong></div>
        <div class="muted small">${escapeHtml(item.reportGroup || '—')} · ${escapeHtml(item.owner || 'Без owner')}</div>
      </td>
      ${model.ganttColumns.map((column) => {
        const active = (item.ganttMonths || []).some((entry) => `${entry.label} ${entry.year}` === column);
        return `<td>${active ? badge('●', 'ok') : ''}</td>`;
      }).join('')}
    </tr>
  `).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Продукт / календарь новинок</h2>
        <p>Единый слой по новинкам: фильтры по календарю, карточки товаров, связь с реестром SKU, месяцы gantt и выгрузка в Excel.</p>
      </div>
      <div class="badge-stack">
        ${badge(`${fmt.int(model.filteredItems.length)} строк в фокусе`, model.filteredItems.length ? 'info' : 'warn')}
        ${badge(`${fmt.int(model.upcomingItems.length)} скоро к запуску`, model.upcomingItems.length ? 'warn' : 'ok')}
        ${badge(`${fmt.int(withoutOwner)} без owner`, withoutOwner ? 'warn' : 'ok')}
      </div>
    </div>

    <div class="kpi-strip">
      <div class="mini-kpi"><span>Всего новинок</span><strong>${fmt.int(model.filteredItems.length)}</strong><span>по текущему фильтру</span></div>
      <div class="mini-kpi"><span>Есть в реестре SKU</span><strong>${fmt.int(registryLinked)}</strong><span>${fmt.pct(model.filteredItems.length ? registryLinked / model.filteredItems.length : 0)}</span></div>
      <div class="mini-kpi warn"><span>С блокерами</span><strong>${fmt.int(withBlockers)}</strong><span>нужно добить данные или owner</span></div>
      <div class="mini-kpi"><span>Активные задачи</span><strong>${fmt.int(activeTasksTotal)}</strong><span>подтянуты из задач портала</span></div>
      <div class="mini-kpi"><span>Есть материалы</span><strong>${fmt.int(model.filteredSummary.withPresentation)}</strong><span>карточки и презентации</span></div>
      <div class="mini-kpi"><span>Gantt заполнен</span><strong>${fmt.int(model.filteredSummary.withGantt)}</strong><span>контроль по срокам</span></div>
    </div>

    ${renderLaunchMonthFilters(model)}

    ${model.ganttColumns.length ? `
      <details class="card" style="margin-top:14px" data-launch-gantt-fold ${ganttExpanded ? 'open' : ''}>
        <summary style="list-style:none; cursor:pointer;">
          <div class="section-subhead">
            <div>
              <h3>Gantt по фильтру</h3>
              <p class="small muted">Верхние месяцы подтягиваются из листа “Календарь новинок Гант”. Для удобства показываем первые 12 строк текущего среза.</p>
            </div>
            <div class="badge-stack">
              ${badge(`${fmt.int(model.ganttColumns.length)} месяцев`, 'info')}
              ${badge(ganttExpanded ? 'Свернуть' : 'Развернуть', 'info')}
            </div>
          </div>
        </summary>
        <div class="table-wrap" style="margin-top:12px">
          <table>
            <thead>
              <tr>
                <th>Новинка</th>
                ${model.ganttColumns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${ganttRows || `<tr><td colspan="${model.ganttColumns.length + 1}"><div class="empty">Gantt по текущему фильтру пока пустой.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </details>
    ` : ''}

    <div class="card launch-audit-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Источник и покрытие</h3>
          <p class="small muted">Карточки и gantt подтягиваются из файла Ксюши. Если новинка уже заведена в реестре SKU, здесь должны появляться связка, owner и задачи.</p>
        </div>
        <div class="badge-stack">
          ${badge(sourceLabel, 'info')}
          ${badge(`Готово к запуску ${fmt.int(model.filteredSummary.ready)}`, model.filteredSummary.ready ? 'ok' : 'warn')}
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Как читать этот экран</h3>
          <p class="small muted">Сначала фильтруем продуктовый календарь, затем смотрим ближайшие запуски и только потом уходим в конкретный месяц. Так сохраняется логика “от общего к частному”.</p>
        </div>
        <div class="badge-stack">
          ${badge('Фильтр → ближайшие запуски → месяцы', 'info')}
          ${badge('Excel по текущему фильтру', 'ok')}
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Ближайшие запуски</h3>
          <p class="small muted">Сюда попадают товары, у которых месяц запуска уже близко. Это возвращает в работу новинки до того, как они потеряются в таблице.</p>
        </div>
        ${badge(`${fmt.int(model.upcomingItems.length)} позиций`, model.upcomingItems.length ? 'warn' : 'ok')}
      </div>
      <div class="list" style="margin-top:12px">${model.upcomingItems.slice(0, 8).map(renderLaunchItem).join('') || '<div class="empty">В ближайшие 45 дней новинок по фильтру не найдено.</div>'}</div>
    </div>

    ${model.sections.map((section) => `
      <div class="card" style="margin-top:14px">
        <div class="section-subhead">
          <div>
            <h3>${escapeHtml(section.label)}</h3>
            <p class="small muted">Карточки новинок, которые относятся к этому месяцу запуска.</p>
          </div>
          <div class="badge-stack">
            ${badge(`${fmt.int(section.items.length)} SKU`, section.items.length ? 'info' : '')}
            ${badge(`${fmt.int(section.items.filter((item) => !item.owner).length)} без owner`, section.items.filter((item) => !item.owner).length ? 'warn' : 'ok')}
          </div>
        </div>
        <div class="list" style="margin-top:14px">${section.items.map(renderLaunchItem).join('') || '<div class="empty">В этом месяце запусков по фильтру нет.</div>'}</div>
      </div>
    `).join('') || '<div class="card" style="margin-top:14px"><div class="empty">В текущем срезе новинок не найдено.</div></div>'}
  `;

  bindLaunchMonthFilters(root, model);
  bindLaunchGanttFold(root);
  bindLaunchItemActions(root);
}

function renderLaunchControl() {
  const root = document.getElementById('view-launch-control');
  const model = getLaunchViewModel();
  const items = model.filteredItems;
  const phaseOrder = ['owner', 'supply', 'content', 'economy', 'scale'];
  const sourceLabel = model.sourceFiles[0] || 'Портальные черновики';
  const groups = phaseOrder
    .map((key) => ({ key, meta: launchPhaseMeta(key), items: items.filter((item) => item.phase === key) }))
    .filter((group) => group.items.length);

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Запуск новинок</h2>
        <p>Операционный экран запуска: сверху видно, какой этап сейчас держит новинку, ниже ближайшие позиции и карточки по каждой фазе запуска.</p>
      </div>
      <div class="badge-stack">
        ${badge(`${fmt.int(items.length)} в запуске`, items.length ? 'info' : 'warn')}
        ${badge(`${fmt.int(items.filter((item) => item.phase === 'owner').length)} ждут owner`, items.filter((item) => item.phase === 'owner').length ? 'warn' : 'ok')}
        ${badge(`${fmt.int(model.upcomingItems.length)} скоро к запуску`, model.upcomingItems.length ? 'warn' : 'ok')}
      </div>
    </div>

    ${renderLaunchMonthFilters(model)}

    <div class="kpi-strip">
      <div class="mini-kpi"><span>Есть owner</span><strong>${fmt.int(model.filteredSummary.withOwner)}</strong><span>из ${fmt.int(model.filteredSummary.total)}</span></div>
      <div class="mini-kpi"><span>Есть SKU</span><strong>${fmt.int(model.filteredSummary.linkedSku)}</strong><span>связка с реестром</span></div>
      <div class="mini-kpi"><span>Есть материалы</span><strong>${fmt.int(model.filteredSummary.withPresentation)}</strong><span>презентации и ссылки</span></div>
      <div class="mini-kpi"><span>Источник</span><strong>${fmt.int(model.sourceFiles.length || 1)}</strong><span>${escapeHtml(sourceLabel)}</span></div>
    </div>

    <div class="grid cards" style="margin-top:14px">
      ${groups.map((group) => `
        <div class="card kpi">
          <div class="label">${escapeHtml(group.meta.label)}</div>
          <div class="value">${fmt.int(group.items.length)}</div>
          <div class="hint">SKU в этой фазе запуска</div>
          <div class="badge-stack" style="margin-top:10px">${group.items.slice(0, 3).map((item) => badge(item.owner || item.name, item.owner ? '' : 'warn')).join('')}</div>
        </div>
      `).join('') || '<div class="card"><div class="empty">SKU в запуске сейчас не найдены.</div></div>'}
    </div>

    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Ближайшие позиции к запуску</h3>
          <p class="small muted">Если в продукте подходит срок, новинка должна появляться здесь автоматически вместе с owner, карточкой и статусом по реестру SKU.</p>
        </div>
        ${badge(`${fmt.int(model.upcomingItems.length)} позиций`, model.upcomingItems.length ? 'warn' : 'ok')}
      </div>
      <div class="list" style="margin-top:12px">${model.upcomingItems.slice(0, 8).map(renderLaunchItem).join('') || '<div class="empty">Нет ближайших запусков по текущему фильтру.</div>'}</div>
    </div>

    ${groups.map((group) => `
      <div class="card" style="margin-top:14px">
        <div class="section-subhead">
          <div>
            <h3>${escapeHtml(group.meta.label)}</h3>
            <p class="small muted">Что надо закрыть на этом этапе, чтобы новинка не зависала между отделами.</p>
          </div>
          ${badge(`${fmt.int(group.items.length)} SKU`, group.meta.tone)}
        </div>
        <div class="list">
          ${group.items.map((item) => `
            <div class="list-item">
              <div class="head">
                <div>
                  <strong>${item.articleKey ? linkToSku(item.articleKey, item.name || 'Новинка') : escapeHtml(item.name || 'Новинка')}</strong>
                  <div class="muted small">${escapeHtml(item.subCategory || '—')} · ${escapeHtml(launchDueDateLabel(item))}</div>
                </div>
                <div class="badge-stack">
                  ${item.owner ? badge(item.owner, 'info') : badge('Без owner', 'warn')}
                  ${badge(`${fmt.int(item.activeTasks || 0)} задач`, item.activeTasks ? 'warn' : 'ok')}
                  ${item.articleMatched ? badge('SKU найден', 'ok') : badge('Нужна связка с SKU', 'warn')}
                </div>
              </div>
              <div class="quick-actions" style="margin-top:10px; justify-content:flex-start">
                <button class="quick-chip" type="button" data-launch-edit="${escapeHtml(item.id)}">Редактировать</button>
                <button class="quick-chip portal-action-primary" type="button" data-launch-task="${escapeHtml(item.id)}">${item.activeTasks ? 'Открыть задачу' : 'Поставить задачу'}</button>
                ${item.presentationUrl ? launchLinkHtml(item.presentationUrl) : ''}
              </div>
              <div class="check-list">
                <div class="check-item"><strong>1.</strong><span>${item.owner ? `Owner назначен: ${escapeHtml(item.owner)}` : 'Назначить owner и контур работы по новинке'}</span></div>
                <div class="check-item"><strong>2.</strong><span>${item.articleMatched ? `Связка с реестром SKU есть${item.registryStatus ? ` · ${escapeHtml(item.registryStatus)}` : ''}` : 'Связать товар с реестром SKU, чтобы подтягивались карточка и задачи'}</span></div>
                <div class="check-item"><strong>3.</strong><span>${item.marketplaces ? `Площадки: ${escapeHtml(item.marketplaces)}` : 'Указать площадки запуска и базовые материалы по товару'}</span></div>
                <div class="check-item"><strong>4.</strong><span>${item.presentationUrl ? `Презентация: ${escapeHtml(item.presentationUrl)}` : 'Добавить презентацию или ссылку на материалы по товару'}</span></div>
                <div class="check-item"><strong>5.</strong><span>${(item.blockers || []).length ? `Блокеры: ${escapeHtml(item.blockers.join(', '))}` : 'Критичных блокеров на текущем этапе не видно'}</span></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  `;

  bindLaunchMonthFilters(root, model);
  bindLaunchItemActions(root);
}

window.__ALTEA_MODERN_LAUNCH_PORTAL__ = true;

function renderMeetings() {
  const root = document.getElementById('view-meetings');
  const cards = (state.meetings || []).map((meeting) => {
    const level = String(meeting.id || '').startsWith('weekly') ? 'Weekly' : String(meeting.id || '').startsWith('monthly') ? 'Monthly' : 'PMR';
    const outputs = Array.isArray(meeting.outputs) ? meeting.outputs.join(' В· ') : (meeting.outputs || 'вЂ”');
    const participants = Array.isArray(meeting.participants) ? meeting.participants.join(', ') : 'вЂ”';
    return `
      <div class="card meeting-card">
        <div class="head">
          <div>
            <h3>${escapeHtml(meeting.title || 'Р’СЃС‚СЂРµС‡Р°')}</h3>
            <div class="muted small">${escapeHtml(meeting.cadence || 'вЂ”')} В· ${escapeHtml(meeting.duration || 'вЂ”')}</div>
          </div>
          ${badge(level)}
        </div>
        <p>${escapeHtml(meeting.question || 'вЂ”')}</p>
        <div class="muted small"><strong>РЈС‡Р°СЃС‚РЅРёРєРё:</strong> ${escapeHtml(participants)}</div>
        <div class="muted small" style="margin-top:8px"><strong>Р’С‹С…РѕРґ:</strong> ${escapeHtml(outputs)}</div>
      </div>
    `;
  }).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Р РёС‚Рј СЂР°Р±РѕС‚С‹</h2>
        <p>Weekly / Monthly / PMR РґРѕР»Р¶РЅС‹ СЂРѕР¶РґР°С‚СЊ Р·Р°РґР°С‡Рё СЃ owner Рё СЃСЂРѕРєРѕРј вЂ” Р±РµР· СЌС‚РѕРіРѕ РїРѕСЂС‚Р°Р» РЅРµ Р±СѓРґРµС‚ Р¶РёРІС‹Рј.</p>
      </div>
    </div>
    <div class="grid cards-2">${cards || '<div class="empty">РќРµС‚ РєР°СЂС‚С‹ РІСЃС‚СЂРµС‡</div>'}</div>
  `;
}


function getDocumentGroupsFiltered() {
  const search = String(state.docFilters.search || '').trim().toLowerCase();
  return (state.documents?.groups || [])
    .map((group) => ({
      ...group,
      items: (group.items || []).filter((item) => {
        const hay = [group.title, item.title, item.description, item.type, item.filename].filter(Boolean).join(' ').toLowerCase();
        if (state.docFilters.group !== 'all' && group.title !== state.docFilters.group) return false;
        if (search && !hay.includes(search)) return false;
        return true;
      })
    }))
    .filter((group) => group.items.length);
}


