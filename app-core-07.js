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

  body.innerHTML = `
    <div class="modal-head">
      <div>
        <div class="muted small">${escapeHtml(sku.brand || 'РђР»С‚РµСЏ')} В· ${escapeHtml(sku.segment || sku.category || 'вЂ”')}</div>
        <h2>${escapeHtml(sku.name || 'Р‘РµР· РЅР°Р·РІР°РЅРёСЏ')}</h2>
        <div class="badge-stack">${linkToSku(sku.articleKey, sku.article || sku.articleKey)}${skuOperationalStatus(sku)}${scoreChip(sku.focusScore || 0)}${trafficBadges(sku, 'РЅРµС‚')}</div>
      </div>
      <button class="btn ghost" data-close-modal>Р—Р°РєСЂС‹С‚СЊ</button>
    </div>

    <div class="kv-3">
      <div class="card subtle">
        <h3>Р РµР·СѓР»СЊС‚Р°С‚</h3>
        ${resultRows.join('')}
        ${metricRow('WB РјР°СЂР¶Р°', fmt.pct(sku.wb?.marginPct), (sku.wb?.marginPct || 0) < 0 ? 'danger-text' : '')}
        ${metricRow('Ozon РјР°СЂР¶Р°', fmt.pct(sku.ozon?.marginPct), (sku.ozon?.marginPct || 0) < 0 ? 'danger-text' : '')}
      </div>
      <div class="card subtle">
        <h3>РџРѕС‡РµРјСѓ РІ С„РѕРєСѓСЃРµ</h3>
        ${metricRow('Owner', escapeHtml(ownerName(sku) || 'РќРµ Р·Р°РєСЂРµРїР»С‘РЅ'))}
        ${metricRow('WB РѕСЃС‚Р°С‚РѕРє', fmt.int(sku.wb?.stock), (sku.wb?.stock || 0) <= 50 ? 'warn-text' : '')}
        ${metricRow('Ozon РѕСЃС‚Р°С‚РѕРє', fmt.int(sku.ozon?.stock), (sku.ozon?.stock || 0) <= 50 ? 'warn-text' : '')}
        ${metricRow('Р’РѕР·РІСЂР°С‚С‹ WB', fmt.pct(sku.returns?.wbPct), (sku.returns?.wbPct || 0) >= 0.05 ? 'warn-text' : '')}
        ${metricRow('Р’РѕР·РІСЂР°С‚С‹ Ozon', fmt.pct(sku.returns?.ozonPct), (sku.returns?.ozonPct || 0) >= 0.05 ? 'warn-text' : '')}
        <div class="note-box">${escapeHtml(sku.focusReasons || 'РќРµС‚ СЏРІРЅРѕР№ РїСЂРёС‡РёРЅС‹ РІ С‚РµРєСѓС‰РµРј СЃСЂРµР·Рµ.')}</div>
      </div>
      <div class="card subtle">
        <h3>Р§С‚Рѕ РґРµР»Р°РµРј</h3>
        <div class="badge-stack">${activeTask ? taskPriorityBadge(activeTask) : ''}${activeTask ? taskStatusBadge(activeTask) : ''}${activeTask ? taskTypeBadge(activeTask) : ''}</div>
        <div class="note-box">${escapeHtml(activeTask?.nextAction || 'РђРєС‚РёРІРЅРѕР№ Р·Р°РґР°С‡Рё РїРѕРєР° РЅРµС‚.')}</div>
        <div class="metric-row"><span>РЎР»РµРґСѓСЋС‰РёР№ СЃСЂРѕРє</span><strong>${escapeHtml(activeTask?.due || 'вЂ”')}</strong></div>
        <div class="metric-row"><span>Р’РЅРµС€РЅРёР№ С‚СЂР°С„РёРє</span><strong>${sku?.flags?.hasExternalTraffic ? 'Р•СЃС‚СЊ' : 'РќРµС‚'}</strong></div>
      </div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <h3>Р—Р°РґР°С‡Рё РїРѕ SKU</h3>
        <div class="list">${tasks.length ? tasks.map(renderTaskCard).join('') : '<div class="empty">РџРѕ СЌС‚РѕРјСѓ SKU Р·Р°РґР°С‡ РµС‰С‘ РЅРµС‚</div>'}</div>
      </div>
      <div class="card">
        <h3>Р”РѕР±Р°РІРёС‚СЊ Р·Р°РґР°С‡Сѓ</h3>
        <form id="manualTaskForm" class="form-grid compact">
          <input type="hidden" name="articleKey" value="${escapeHtml(articleKey)}">
          <input name="title" placeholder="Р§С‚Рѕ РґРµР»Р°РµРј" required>
          <select name="type">${Object.entries(TASK_TYPE_META).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('')}</select>
          <select name="priority">${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}">${escapeHtml(meta.label)}</option>`).join('')}</select>
          <select name="platform">
            <option value="cross">РћР±С‰РёР№ РєРѕРЅС‚СѓСЂ</option>
            <option value="wb">Р РћРџ WB</option>
            <option value="ozon">Р РћРџ Ozon</option>
            <option value="retail">РЇРњ / Р›РµС‚СѓР°Р»СЊ / РњР°РіРЅРёС‚ / Р—РЇ</option>
          </select>
          <input name="owner" placeholder="Owner" value="${escapeHtml(ownerName(sku) || '')}">
          <input name="due" type="date" value="${plusDays(3)}">
          <textarea name="nextAction" rows="3" placeholder="РЎР»РµРґСѓСЋС‰РµРµ РґРµР№СЃС‚РІРёРµ Рё С‡С‚Рѕ СЃС‡РёС‚Р°РµРј СЂРµР·СѓР»СЊС‚Р°С‚РѕРј"></textarea>
          <button class="btn primary" type="submit">Р”РѕР±Р°РІРёС‚СЊ Р·Р°РґР°С‡Сѓ</button>
        </form>
      </div>
    </div>

    <div class="modal-grid-3">
      <div class="card">
        <div class="modal-section-title">
          <div>
            <h3>Owner Рё Р·РѕРЅР° РѕС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚Рё</h3>
            <p class="small muted">Р—Р°РєСЂРµРїР»РµРЅРёРµ РїРѕ SKU Рё РєРѕСЂРѕС‚РєР°СЏ РїРѕРјРµС‚РєР°, РµСЃР»Рё owner РјРµРЅСЏРµС‚СЃСЏ.</p>
          </div>
          <span class="owner-badge">${escapeHtml(ownerName(sku) || 'РќРµ Р·Р°РєСЂРµРїР»С‘РЅ')}</span>
        </div>
        <datalist id="skuOwnerList">${owners.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
        <form id="ownerForm" class="form-grid compact">
          <input name="ownerName" list="skuOwnerList" placeholder="РљС‚Рѕ owner" value="${escapeHtml(ownerName(sku) || '')}" required>
          <input name="ownerRole" placeholder="Р РѕР»СЊ / Р·РѕРЅР°" value="${escapeHtml(sku?.owner?.registryStatus || 'Owner SKU')}">
          <textarea name="note" rows="3" placeholder="Р§С‚Рѕ РІР°Р¶РЅРѕ РїРѕ Р·Р°РєСЂРµРїР»РµРЅРёСЋ / РїРµСЂРµРґР°С‡Рµ SKU"></textarea>
          <button class="btn" type="submit">РЎРѕС…СЂР°РЅРёС‚СЊ owner</button>
        </form>
        <div class="team-note">РљРѕРјР°РЅРґРЅС‹Р№ СЂРµР¶РёРј: ${escapeHtml(state.team.note || 'Р›РѕРєР°Р»СЊРЅС‹Р№ СЂРµР¶РёРј')}</div>
      </div>
      <div class="card">
        <div class="modal-section-title">
          <div>
            <h3>Р–СѓСЂРЅР°Р» СЂРµС€РµРЅРёР№</h3>
            <p class="small muted">РўРѕ, С‡С‚Рѕ СѓР¶Рµ СЃРѕРіР»Р°СЃРѕРІР°Р»Рё РёР»Рё Р¶РґС‘С‚ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ СЂСѓРєРѕРІРѕРґРёС‚РµР»СЏ.</p>
          </div>
          ${badge(`${fmt.int(decisions.length)} Р·Р°РїРёСЃРµР№`, decisions.length ? 'info' : '')}
        </div>
        <div class="small-stack">${decisions.length ? decisions.map((item) => `
          <div class="decision-item">
            <div class="head">
              <strong>${escapeHtml(item.title)}</strong>
              <div class="badge-stack">${taskStatusBadge(item)}${item.owner ? badge(item.owner, 'info') : ''}</div>
            </div>
            <div class="muted small">${escapeHtml(item.decision || 'Р РµС€РµРЅРёРµ РЅРµ Р·Р°РїРѕР»РЅРµРЅРѕ')}</div>
            <div class="meta-line" style="margin-top:8px"><span class="muted small">РЎСЂРѕРє ${escapeHtml(item.due || 'вЂ”')}</span><span class="muted small">${escapeHtml(item.createdBy || 'РљРѕРјР°РЅРґР°')}</span></div>
          </div>
        `).join('') : '<div class="empty">Р РµС€РµРЅРёР№ РїРѕРєР° РЅРµС‚</div>'}</div>
      </div>
      <div class="card">
        <div class="modal-section-title">
          <div>
            <h3>Р”РѕР±Р°РІРёС‚СЊ СЂРµС€РµРЅРёРµ</h3>
            <p class="small muted">Р¤РёРєСЃРёСЂСѓРµРј РЅРµ РѕР±СЃСѓР¶РґРµРЅРёРµ, Р° РёС‚РѕРі: С‡С‚Рѕ СЂРµС€РёР»Рё, РєС‚Рѕ owner, РєР°РєРѕР№ СЃСЂРѕРє.</p>
          </div>
        </div>
        <form id="decisionForm" class="form-grid compact">
          <input name="title" placeholder="РљРѕСЂРѕС‚РєРёР№ Р·Р°РіРѕР»РѕРІРѕРє СЂРµС€РµРЅРёСЏ" required>
          <input name="owner" placeholder="РљС‚Рѕ РІРµРґС‘С‚ СЂРµС€РµРЅРёРµ" value="${escapeHtml(ownerName(sku) || '')}">
          <select name="status">${Object.entries(TASK_STATUS_META).map(([value, meta]) => `<option value="${value}" ${value === 'waiting_decision' ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
          <input name="due" type="date" value="${plusDays(3)}">
          <textarea name="decision" rows="4" placeholder="Р§С‚Рѕ РёРјРµРЅРЅРѕ СЂРµС€РёР»Рё / С‡С‚Рѕ РµС‰С‘ РЅСѓР¶РЅРѕ РїРѕРґС‚РІРµСЂРґРёС‚СЊ" required></textarea>
          <button class="btn" type="submit">РЎРѕС…СЂР°РЅРёС‚СЊ СЂРµС€РµРЅРёРµ</button>
        </form>
      </div>
    </div>

    <div class="two-col" style="margin-top:14px">
      <div class="card">
        <h3>РљРѕРјРјРµРЅС‚Р°СЂРёРё Рё Р°РїРґРµР№С‚С‹</h3>
        <div class="list">${comments.length ? comments.map((comment) => `
          <div class="comment-item">
            <div class="head"><strong>${escapeHtml(comment.author || 'РљРѕРјР°РЅРґР°')}</strong><div class="badge-stack">${commentTypeChip(comment.type)}${badge(comment.team || 'РљРѕРјР°РЅРґР°')}</div></div>
            <div class="muted small">${fmt.date(comment.createdAt)}</div>
            <p>${escapeHtml(comment.text)}</p>
          </div>
        `).join('') : '<div class="empty">РљРѕРјРјРµРЅС‚Р°СЂРёРµРІ РїРѕРєР° РЅРµС‚</div>'}</div>
      </div>
      <div class="card">
        <h3>Р”РѕР±Р°РІРёС‚СЊ Р°РїРґРµР№С‚</h3>
        <form id="commentForm" class="form-grid compact">
          <input type="hidden" name="articleKey" value="${escapeHtml(articleKey)}">
          <input name="author" placeholder="РљС‚Рѕ РїРёС€РµС‚" value="${escapeHtml(state.team.member.name || ownerName(sku) || 'РљРѕРјР°РЅРґР°')}" required>
          <select name="type">
            <option value="signal">РЎРёРіРЅР°Р»</option>
            <option value="risk">Р РёСЃРє</option>
            <option value="focus">Р¤РѕРєСѓСЃ</option>
            <option value="idea">РРґРµСЏ</option>
          </select>
          <textarea name="text" rows="5" placeholder="РљРѕСЂРѕС‚РєРѕ: С‡С‚Рѕ СЃР»СѓС‡РёР»РѕСЃСЊ, С‡С‚Рѕ РґРµР»Р°РµРј, С‡С‚Рѕ РЅСѓР¶РЅРѕ РѕС‚ РґСЂСѓРіРёС…" required></textarea>
          <button class="btn" type="submit">РЎРѕС…СЂР°РЅРёС‚СЊ Р°РїРґРµР№С‚</button>
        </form>
      </div>
    </div>
  `;

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
  if (!owner) return 'owner';
  if (/производ|контракт|поставка|сырье|жд/.test(statusRaw)) return 'supply';
  if (/карточ|контент|дизайн|презент|маркет/.test(statusRaw)) return 'content';
  if (/цен|марж|эконом/.test(statusRaw)) return 'economy';
  if (/запуск|live|продаж|готов/.test(statusRaw)) return 'scale';
  if (!String(item?.marketplaces || '').trim()) return 'content';
  return 'supply';
}

function launchBlockers(item) {
  const blockers = Array.isArray(item?.blockers) ? item.blockers.filter(Boolean) : [];
  if (!launchCurrentOwner(item)) blockers.push('не назначен owner');
  if (!String(item?.articleKey || '').trim()) blockers.push('нет связки с реестром SKU');
  if (!String(item?.marketplaces || '').trim()) blockers.push('не указаны площадки');
  if (!Array.isArray(item?.ganttMonths) || !item.ganttMonths.length) blockers.push('не заполнен gantt');
  return [...new Set(blockers)];
}

function normalizeLaunchItem(item = {}, options = {}) {
  const monthlyRevenuePlan = Array.isArray(item.monthlyRevenuePlan) ? item.monthlyRevenuePlan : [];
  const monthlyLaunchPlan = Array.isArray(item.monthlyLaunchPlan) ? item.monthlyLaunchPlan : [];
  const plannedRevenue = numberOrZero(item.plannedRevenue ?? item.yearlyPlanValue ?? launchPlanSum(monthlyLaunchPlan));
  const owner = launchCurrentOwner(item);
  const phase = launchCurrentPhase(item);
  const linkedTasks = launchLinkedTasks(item, options);
  return {
    id: item.id || stableId('launch', item.articleKey || item.name || item.title || ''),
    articleKey: item.articleKey || '',
    article: item.article || '',
    name: item.name || item.title || 'Новинка',
    reportGroup: item.reportGroup || item.segment || 'Продукт',
    tag: item.tag || 'без тега',
    subCategory: item.subCategory || item.category || '—',
    category: item.category || item.subCategory || '—',
    characteristic: item.characteristic || '',
    marketplaces: item.marketplaces || '',
    launchMonth: normalizeLaunchMonthLabel(item.launchMonth || state.dashboard?.dataFreshness?.launchPlanHorizon || 'Текущий фокус'),
    launchDateKey: launchMonthDateKey(item.launchMonth || state.dashboard?.dataFreshness?.launchPlanHorizon || ''),
    status: item.status || 'Статус не указан',
    phase,
    owner,
    production: item.production || '',
    plannedRevenue,
    targetCost: numberOrZero(item.targetCost),
    grossMarginPct: item.grossMarginPct === null || item.grossMarginPct === undefined ? null : Number(item.grossMarginPct),
    grossMarginRub: numberOrZero(item.grossMarginRub),
    externalTraffic: item.externalTraffic || 'без внешнего трафика',
    articleMatched: Boolean(item.articleKey),
    ganttMonths: Array.isArray(item.ganttMonths) ? item.ganttMonths : [],
    monthlyRevenuePlan,
    monthlyLaunchPlan,
    yearlyPlanValue: numberOrZero(item.yearlyPlanValue),
    registryStatus: item.registryStatus || '',
    segment: item.segment || '',
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
  return source.sort((a, b) => launchMonthSortValue(a.launchMonth) - launchMonthSortValue(b.launchMonth) || a.name.localeCompare(b.name, 'ru'));
}

function getLaunchFilters() {
  state.launchFilters = state.launchFilters || {};
  state.launchFilters.month = state.launchFilters.month || 'all';
  state.launchFilters.search = state.launchFilters.search || '';
  state.launchFilters.group = state.launchFilters.group || 'all';
  state.launchFilters.tag = state.launchFilters.tag || 'all';
  state.launchFilters.status = state.launchFilters.status || 'all';
  state.launchFilters.phase = state.launchFilters.phase || 'all';
  return state.launchFilters;
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

function launchDaysUntil(item) {
  if (!item?.launchDateKey) return Number.POSITIVE_INFINITY;
  return diffFromTodayInDays(item.launchDateKey);
}

function launchExportRows(items) {
  return items.map((item) => ({
    article_key: item.articleKey || '',
    article: item.article || '',
    owner: item.owner || '',
    group: item.reportGroup || '',
    tag: item.tag || '',
    launch_month: item.launchMonth || '',
    status: item.status || '',
    phase: launchPhaseMeta(item.phase).label,
    name: item.name || '',
    sub_category: item.subCategory || '',
    marketplaces: item.marketplaces || '',
    characteristic: item.characteristic || '',
    target_cost: item.targetCost || '',
    planned_revenue: item.plannedRevenue || '',
    yearly_plan: item.yearlyPlanValue || '',
    active_tasks: item.activeTasks || 0,
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
    ['launch_month', 'Месяц запуска'],
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
    ['planned_revenue', 'План / сумма'],
    ['yearly_plan', 'План за год'],
    ['active_tasks', 'Активные задачи'],
    ['blockers', 'Блокеры'],
    ['gantt', 'Gantt']
  ], launchExportRows(items), `${scope}-${todayIso()}.xls`);
}

function getLaunchViewModel() {
  const items = getLaunchItems();
  const filters = getLaunchFilters();
  const months = getLaunchMonthOptions(items);
  const groups = launchUniqueOptions(items, (item) => item.reportGroup);
  const tags = launchUniqueOptions(items, (item) => item.tag);
  const statuses = launchUniqueOptions(items, (item) => item.status);
  const phases = ['owner', 'supply', 'content', 'economy', 'scale'];
  if (filters.month !== 'all' && !months.some((item) => item.label === filters.month)) filters.month = 'all';
  if (filters.group !== 'all' && !groups.includes(filters.group)) filters.group = 'all';
  if (filters.tag !== 'all' && !tags.includes(filters.tag)) filters.tag = 'all';
  if (filters.status !== 'all' && !statuses.includes(filters.status)) filters.status = 'all';
  if (filters.phase !== 'all' && !phases.includes(filters.phase)) filters.phase = 'all';
  const search = String(filters.search || '').trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    if (filters.month !== 'all' && normalizeLaunchMonthLabel(item.launchMonth) !== filters.month) return false;
    if (filters.group !== 'all' && item.reportGroup !== filters.group) return false;
    if (filters.tag !== 'all' && item.tag !== filters.tag) return false;
    if (filters.status !== 'all' && item.status !== filters.status) return false;
    if (filters.phase !== 'all' && item.phase !== filters.phase) return false;
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
  return { items, filters, months, groups, tags, statuses, phases, filteredItems, sections, ganttColumns, upcomingItems };
}

function renderLaunchMonthFilters(model) {
  return `
    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Фильтры продукта</h3>
          <p class="small muted">Срез можно быстро сузить по месяцу, группе, тегу, статусу и этапу запуска. Выгрузка в Excel берёт уже отфильтрованный список.</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(model.filteredItems.length)} строк`, model.filteredItems.length ? 'info' : 'warn')}
          ${model.filters.month !== 'all' ? badge(model.filters.month, 'warn') : badge('Все месяцы', 'ok')}
        </div>
      </div>
      <div class="control-filters" style="margin-top:12px">
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
      </div>
      <div class="quick-actions" style="margin-top:12px">
        <button class="quick-chip" type="button" data-launch-export="product">Выгрузить Excel</button>
        <button class="quick-chip" type="button" data-launch-export="launch-control">Excel для запуска</button>
      </div>
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
  root.querySelectorAll('[data-launch-export]').forEach((button) => {
    button.addEventListener('click', () => {
      const scope = button.getAttribute('data-launch-export') || 'launches';
      downloadLaunchesExcel(model.filteredItems, scope);
    });
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
  const getMetric = (item) => {
    if (sortKey === 'romiPct') return item.romiPct ?? Number.NEGATIVE_INFINITY;
    if (sortKey === 'ctrPct') return item.ctrPct ?? Number.NEGATIVE_INFINITY;
    if (sortKey === 'drrPct') return item.drrPct ?? Number.POSITIVE_INFINITY;
    if (sortKey === 'buyoutPct') return item.buyoutPct ?? Number.NEGATIVE_INFINITY;
    return numberOrZero(item[sortKey]);
  };

  return filtered.sort((left, right) => {
    const leftMetric = getMetric(left);
    const rightMetric = getMetric(right);
    if (sortKey === 'drrPct') {
      return leftMetric - rightMetric || right.buys - left.buys || left.name.localeCompare(right.name, 'ru');
    }
    return rightMetric - leftMetric || right.buys - left.buys || left.name.localeCompare(right.name, 'ru');
  });
}

function renderProductLeaderboard() {
  const root = document.getElementById('view-product-leaderboard');
  state.productLeaderboard = normalizeProductLeaderboardPayload(state.productLeaderboard || {});
  const payload = currentProductLeaderboardPayload();
  const filters = getProductLeaderboardFilters();
  const filteredItems = getFilteredProductLeaderboardItems(payload);
  const filteredSummary = productLeaderboardSummaryFromItems(filteredItems);
  const ownerCoverage = filteredSummary.skuCount > 0 ? filteredSummary.ownerCount / filteredSummary.skuCount : 0;
  const snapshots = productLeaderboardHistoryPayloads();
  const historyOptions = snapshots.slice(1);
  const historyCards = snapshots.slice(0, 6).map((snapshot) => {
    const snapshotSummary = productLeaderboardSummaryFromItems(snapshot.items || []);
    return `
      <div class="list-item">
        <div class="head">
          <div>
            <strong>${escapeHtml(productLeaderboardSnapshotLabel(snapshot))}</strong>
            <div class="muted small">${escapeHtml(snapshot.sourceSheetName || 'weekly КЗ-лист')} · ${fmt.int(snapshotSummary.skuCount)} SKU</div>
          </div>
          <div class="badge-stack">
            ${badge(`Охваты ${fmt.int(snapshotSummary.reach)}`, 'info')}
            ${badge(`Клики ${fmt.int(snapshotSummary.clicks)}`, 'info')}
            ${badge(`Корзины ${fmt.int(snapshotSummary.carts)}`, 'info')}
          </div>
        </div>
        <div class="muted small" style="margin-top:8px">Выручка ${fmt.money(snapshotSummary.revenue)} · ROMI ${fmt.pct(snapshotSummary.romiPct)} · ДРР ${fmt.pct(snapshotSummary.drrPct)}</div>
      </div>
    `;
  }).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Продуктовый лидерборд</h2>
        <p>Единый недельный продуктовый срез: сверху общая воронка и история выгрузок, ниже SKU с охватами, кликами, корзинами, экономикой и рисками.</p>
      </div>
      <div class="badge-stack">
        ${badge(payload.weekLabel || 'недельный срез', 'info')}
        ${badge(`${fmt.int(filteredSummary.skuCount)} SKU`, filteredSummary.skuCount ? 'info' : 'warn')}
        ${badge(`${fmt.int(payload.totals.unmatchedRows || 0)} вне портала`, payload.totals.unmatchedRows ? 'warn' : 'ok')}
        ${badge(`${fmt.int(payload.alertCounts.critical || 0)} крит. откл.`, payload.alertCounts.critical ? 'danger' : 'ok')}
      </div>
    </div>

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
          <button class="quick-chip" type="button" data-product-leaderboard-export>Выгрузить Excel</button>
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
              <th>Охваты</th>
              <th>Клики</th>
              <th>Корзины</th>
              <th>Заказы</th>
              <th>Выкупы</th>
              <th>CTR</th>
              <th>CR</th>
              <th>ROMI</th>
              <th>ДРР</th>
              <th>Выручка</th>
              <th>Доход</th>
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
    rerenderCurrentView();
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
  return `
    <div class="list-item">
      <div class="head">
        <div>
          <strong>${item.articleKey ? linkToSku(item.articleKey, item.name || 'Новинка') : escapeHtml(item.name || 'Новинка')}</strong>
          <div class="muted small">${escapeHtml(item.reportGroup || '—')} · ${escapeHtml(item.subCategory || '—')} · ${escapeHtml(item.launchMonth || 'Без месяца')}</div>
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
      </div>
      <div class="muted small" style="margin-top:8px">${escapeHtml(item.status || 'Статус не указан')}</div>
      <div class="muted small" style="margin-top:8px">План выручки ${fmt.money(item.plannedRevenue)} · Целевая себестоимость ${fmt.money(item.targetCost)} · Активных задач ${fmt.int(item.activeTasks || 0)}</div>
      <div class="muted small" style="margin-top:8px">${escapeHtml(item.characteristic || 'Описание по новинке пока не заполнено')}</div>
      <div class="muted small" style="margin-top:8px">Gantt: ${escapeHtml(ganttPreview || 'месяцы в плане пока не отмечены')}</div>
      <div class="badge-stack" style="margin-top:8px">${(item.blockers || []).slice(0, 3).map((text) => badge(text, 'warn')).join('') || badge('Блокеры не найдены', 'ok')}</div>
    </div>
  `;
}

function renderLaunches() {
  const root = document.getElementById('view-launches');
  const model = getLaunchViewModel();
  const registryLinked = model.filteredItems.filter((item) => item.articleMatched).length;
  const withoutOwner = model.filteredItems.filter((item) => !item.owner).length;
  const withBlockers = model.filteredItems.filter((item) => (item.blockers || []).length).length;
  const activeTasksTotal = model.filteredItems.reduce((total, item) => total + numberOrZero(item.activeTasks), 0);
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
    </div>

    ${renderLaunchMonthFilters(model)}
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

    ${model.ganttColumns.length ? `
      <div class="card" style="margin-top:14px">
        <div class="section-subhead">
          <div>
            <h3>Gantt по фильтру</h3>
            <p class="small muted">Верхние месяцы подтягиваются из листа “Календарь новинок Гант”. Для удобства показываем первые 12 строк текущего среза.</p>
          </div>
          ${badge(`${fmt.int(model.ganttColumns.length)} месяцев`, 'info')}
        </div>
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
      </div>
    ` : ''}

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
}

function renderLaunchControl() {
  const root = document.getElementById('view-launch-control');
  const model = getLaunchViewModel();
  const items = model.filteredItems;
  const phaseOrder = ['owner', 'supply', 'content', 'economy', 'scale'];
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
                  <div class="muted small">${escapeHtml(item.subCategory || '—')} · ${escapeHtml(item.launchMonth || 'Без месяца')}</div>
                </div>
                <div class="badge-stack">
                  ${item.owner ? badge(item.owner, 'info') : badge('Без owner', 'warn')}
                  ${badge(`${fmt.int(item.activeTasks || 0)} задач`, item.activeTasks ? 'warn' : 'ok')}
                  ${item.articleMatched ? badge('SKU найден', 'ok') : badge('Нужна связка с SKU', 'warn')}
                </div>
              </div>
              <div class="check-list">
                <div class="check-item"><strong>1.</strong><span>${item.owner ? `Owner назначен: ${escapeHtml(item.owner)}` : 'Назначить owner и контур работы по новинке'}</span></div>
                <div class="check-item"><strong>2.</strong><span>${item.articleMatched ? `Связка с реестром SKU есть${item.registryStatus ? ` · ${escapeHtml(item.registryStatus)}` : ''}` : 'Связать товар с реестром SKU, чтобы подтягивались карточка и задачи'}</span></div>
                <div class="check-item"><strong>3.</strong><span>${item.marketplaces ? `Площадки: ${escapeHtml(item.marketplaces)}` : 'Указать площадки запуска и базовые материалы по товару'}</span></div>
                <div class="check-item"><strong>4.</strong><span>${(item.blockers || []).length ? `Блокеры: ${escapeHtml(item.blockers.join(', '))}` : 'Критичных блокеров на текущем этапе не видно'}</span></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  `;

  bindLaunchMonthFilters(root, model);
}

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


