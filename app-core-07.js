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
  if (!ownerName(sku)) return 'РќСѓР¶РµРЅ owner';
  if (sku?.flags?.negativeMargin || sku?.flags?.toWork) return 'РќСѓР¶РЅР° РєРѕСЂСЂРµРєС‚РёСЂРѕРІРєР° СЌРєРѕРЅРѕРјРёРєРё';
  if (totalSkuStock(sku) <= 0) return 'Р–РґС‘Рј РїРѕСЃС‚Р°РІРєСѓ';
  if (!sku?.flags?.hasExternalTraffic) return 'Р“РѕС‚РѕРІРёРј С‚СЂР°С„РёРє';
  return 'Р’ СЂР°Р±РѕС‚Рµ';
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
    owner: { label: 'РќСѓР¶РµРЅ owner', tone: 'warn' },
    supply: { label: 'РџРѕСЃС‚Р°РІРєР°', tone: 'warn' },
    content: { label: 'РљРѕРЅС‚РµРЅС‚ / С‚СЂР°С„РёРє', tone: 'info' },
    economy: { label: 'Р­РєРѕРЅРѕРјРёРєР°', tone: 'danger' },
    scale: { label: 'РњР°СЃС€С‚Р°Р±РёСЂРѕРІР°РЅРёРµ', tone: 'ok' }
  };
  return map[phase] || map.content;
}

function normalizeLaunchItem(item = {}) {
  return {
    id: item.id || stableId('launch', item.articleKey || item.name || item.title || ''),
    articleKey: item.articleKey || '',
    name: item.name || item.title || 'РќРѕРІРёРЅРєР°',
    reportGroup: item.reportGroup || item.segment || 'РџСЂРѕРґСѓРєС‚',
    subCategory: item.subCategory || item.category || 'вЂ”',
    launchMonth: item.launchMonth || state.dashboard?.dataFreshness?.launchPlanHorizon || 'РўРµРєСѓС‰РёР№ С„РѕРєСѓСЃ',
    status: item.status || 'РЎС‚Р°С‚СѓСЃ РЅРµ СѓРєР°Р·Р°РЅ',
    phase: item.phase || 'content',
    owner: item.owner || '',
    production: item.production || '',
    plannedRevenue: numberOrZero(item.plannedRevenue),
    targetCost: numberOrZero(item.targetCost),
    externalTraffic: item.externalTraffic || 'Р±РµР· РІРЅРµС€РЅРµРіРѕ С‚СЂР°С„РёРєР°',
    activeTasks: numberOrZero(item.activeTasks),
    blockers: Array.isArray(item.blockers) ? item.blockers.filter(Boolean) : []
  };
}

function buildLaunchItemsFromSkus() {
  return state.skus
    .filter((sku) => String(sku?.segment || '').toUpperCase() === 'GROWTH' || String(sku?.status || '').toLowerCase().includes('РЅРѕРІ'))
    .map((sku) => {
      const phase = deriveLaunchPhase(sku);
      const blockers = [];
      if (!ownerName(sku)) blockers.push('РЅРµ РЅР°Р·РЅР°С‡РµРЅ owner');
      if (totalSkuStock(sku) <= 0) blockers.push('РЅРµС‚ РѕСЃС‚Р°С‚РєР°');
      if (!sku?.flags?.hasExternalTraffic) blockers.push('РЅРµС‚ РІРЅРµС€РЅРµРіРѕ С‚СЂР°С„РёРєР°');
      if (sku?.flags?.negativeMargin) blockers.push('РјР°СЂР¶Р° РІ СЂРёСЃРєРµ');
      if (sku?.flags?.highReturn) blockers.push('РІС‹СЃРѕРєРёРµ РІРѕР·РІСЂР°С‚С‹');
      return normalizeLaunchItem({
        articleKey: sku.articleKey,
        name: sku.name || sku.article || sku.articleKey,
        reportGroup: sku.segment || 'GROWTH',
        subCategory: sku.category || 'вЂ”',
        launchMonth: state.dashboard?.dataFreshness?.launchPlanHorizon || 'РўРµРєСѓС‰РёР№ С„РѕРєСѓСЃ',
        status: deriveLaunchStatus(sku),
        phase,
        owner: ownerName(sku),
        production: totalSkuStock(sku) > 0 ? `РћСЃС‚Р°С‚РѕРє ${fmt.int(totalSkuStock(sku))}` : 'Р‘РµР· РѕСЃС‚Р°С‚РєР°',
        plannedRevenue: monthRevenue(sku),
        targetCost: 0,
        externalTraffic: externalTrafficLabel(sku),
        activeTasks: getSkuControlTasks(sku.articleKey).filter(isTaskActive).length,
        blockers
      });
    })
    .sort((a, b) => b.activeTasks - a.activeTasks || b.plannedRevenue - a.plannedRevenue || a.name.localeCompare(b.name, 'ru'));
}

function getLaunchItems() {
  const source = Array.isArray(state.launches) && state.launches.length ? state.launches.map(normalizeLaunchItem) : buildLaunchItemsFromSkus();
  return source.slice(0, 24);
}

function getLaunchFilters() {
  state.launchFilters = state.launchFilters || {};
  state.launchFilters.month = state.launchFilters.month || 'all';
  return state.launchFilters;
}

function normalizeLaunchMonthLabel(value) {
  const label = String(value || '').trim();
  return label || 'Р‘РµР· РјРµСЃСЏС†Р°';
}

function launchMonthSortValue(label) {
  const normalized = normalizeLaunchMonthLabel(label).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized || normalized === 'Р±РµР· РјРµСЃСЏС†Р°') return Number.MAX_SAFE_INTEGER - 1;
  if (normalized.includes('С‚РµРєСѓС‰РёР№') || normalized.includes('С„РѕРєСѓСЃ')) return Number.MAX_SAFE_INTEGER - 2;
  const monthMap = {
    'СЏРЅРІР°СЂСЊ': 1,
    'С„РµРІСЂР°Р»СЊ': 2,
    'РјР°СЂС‚': 3,
    'Р°РїСЂРµР»СЊ': 4,
    'РјР°Р№': 5,
    'РёСЋРЅСЊ': 6,
    'РёСЋР»СЊ': 7,
    'Р°РІРіСѓСЃС‚': 8,
    'СЃРµРЅС‚СЏР±СЂСЊ': 9,
    'РѕРєС‚СЏР±СЂСЊ': 10,
    'РЅРѕСЏР±СЂСЊ': 11,
    'РґРµРєР°Р±СЂСЊ': 12
  };
  const match = normalized.match(/^([Р°-СЏС‘]+)\s+(\d{4})$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const month = monthMap[match[1]];
  const year = Number(match[2]);
  if (!month || !Number.isFinite(year)) return Number.MAX_SAFE_INTEGER;
  return year * 100 + month;
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

function getLaunchViewModel() {
  const items = getLaunchItems();
  const filters = getLaunchFilters();
  const months = getLaunchMonthOptions(items);
  if (filters.month !== 'all' && !months.some((item) => item.label === filters.month)) {
    filters.month = 'all';
  }
  const filteredItems = filters.month === 'all'
    ? items
    : items.filter((item) => normalizeLaunchMonthLabel(item.launchMonth) === filters.month);
  const sectionMap = new Map();
  filteredItems.forEach((item) => {
    const label = normalizeLaunchMonthLabel(item.launchMonth);
    const bucket = sectionMap.get(label) || [];
    bucket.push(item);
    sectionMap.set(label, bucket);
  });
  const sections = [...sectionMap.entries()]
    .sort((left, right) => launchMonthSortValue(left[0]) - launchMonthSortValue(right[0]) || left[0].localeCompare(right[0], 'ru'))
    .map(([label, monthItems]) => ({ label, items: monthItems }));
  return { items, filters, months, filteredItems, sections };
}

function renderLaunchMonthFilters(model) {
  return `
    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Р¤РёР»СЊС‚СЂ РїРѕ РјРµСЃСЏС†Р°Рј</h3>
          <p class="small muted">РљСЃРµРЅРёСЏ РјРѕР¶РµС‚ РѕС‚РєСЂС‹С‚СЊ РєРѕРЅРєСЂРµС‚РЅС‹Р№ РјРµСЃСЏС† Р·Р°РїСѓСЃРєР° РёР»Рё РґРµСЂР¶Р°С‚СЊ РІСЃСЋ РєР°СЂС‚Сѓ РЅРѕРІРёРЅРѕРє СЃСЂР°Р·Сѓ.</p>
        </div>
        <div class="badge-stack">${badge(`${fmt.int(model.months.length)} РјРµСЃ.`, model.months.length ? 'info' : '')}${model.filters.month !== 'all' ? badge(model.filters.month, 'warn') : badge('Р’СЃРµ РјРµСЃСЏС†С‹', 'ok')}</div>
      </div>
      <div class="quick-actions">
        <button class="quick-chip ${model.filters.month === 'all' ? 'active' : ''}" type="button" data-launch-month="all">Р’СЃРµ РјРµСЃСЏС†С‹ В· ${fmt.int(model.items.length)}</button>
        ${model.months.map((item) => `<button class="quick-chip ${model.filters.month === item.label ? 'active' : ''}" type="button" data-launch-month="${escapeHtml(item.label)}">${escapeHtml(item.label)} В· ${fmt.int(item.count)}</button>`).join('')}
      </div>
    </div>
  `;
}

function bindLaunchMonthFilters(root) {
  root.querySelectorAll('[data-launch-month]').forEach((button) => {
    button.addEventListener('click', () => {
      getLaunchFilters().month = button.dataset.launchMonth || 'all';
      rerenderCurrentView();
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
  if (!filters.sort) filters.sort = 'buys';
  setView('product-leaderboard');
}

window.openProductLeaderboardForSku = openProductLeaderboardForSku;

function getProductLeaderboardFilters() {
  state.productLeaderboardFilters = state.productLeaderboardFilters || {};
  state.productLeaderboardFilters.search = state.productLeaderboardFilters.search || '';
  state.productLeaderboardFilters.owner = state.productLeaderboardFilters.owner || 'all';
  state.productLeaderboardFilters.signal = state.productLeaderboardFilters.signal || 'all';
  state.productLeaderboardFilters.sort = state.productLeaderboardFilters.sort || 'buys';
  return state.productLeaderboardFilters;
}

function getFilteredProductLeaderboardItems(payload) {
  const filters = getProductLeaderboardFilters();
  const search = String(filters.search || '').trim().toLowerCase();
  const filtered = (payload.items || []).filter((item) => {
    if (filters.owner !== 'all' && item.owner !== filters.owner) return false;
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
  const payload = normalizeProductLeaderboardPayload(state.productLeaderboard || {});
  state.productLeaderboard = payload;
  const filters = getProductLeaderboardFilters();
  const filteredItems = getFilteredProductLeaderboardItems(payload);
  const filteredSummary = productLeaderboardSummaryFromItems(filteredItems);
  const ownerCoverage = filteredSummary.skuCount > 0 ? filteredSummary.ownerCount / filteredSummary.skuCount : 0;

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Продуктовый лидерборд</h2>
        <p>Недельный КЗ-срез по нашим артикулам: сверху общая воронка, ниже SKU с ROMI, ДРР, CTR и выкупами по каждому продукту.</p>
      </div>
      <div class="badge-stack">
        ${badge(payload.weekLabel || 'недельный срез', 'info')}
        ${badge(`${fmt.int(filteredSummary.skuCount)} SKU`, filteredSummary.skuCount ? 'info' : 'warn')}
        ${badge(`${fmt.int(payload.totals.unmatchedRows || 0)} вне портала`, payload.totals.unmatchedRows ? 'warn' : 'ok')}
        ${badge(`${fmt.int(payload.alertCounts.critical || 0)} крит. откл.`, payload.alertCounts.critical ? 'danger' : 'ok')}
      </div>
    </div>

    <div class="kpi-strip">
      <div class="mini-kpi"><span>Охват</span><strong>${fmt.int(filteredSummary.reach)}</strong><span>общий верх воронки</span></div>
      <div class="mini-kpi"><span>Клики</span><strong>${fmt.int(filteredSummary.clicks)}</strong><span>CTR ${fmt.pct(filteredSummary.ctrPct)}</span></div>
      <div class="mini-kpi"><span>Корзина</span><strong>${fmt.int(filteredSummary.carts)}</strong><span>из кликов ${fmt.pct(filteredSummary.cartRatePct)}</span></div>
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
          <h3>Фильтры</h3>
          <p class="small muted">Можно быстро отфильтровать по owner, сигналу и метрике сортировки, чтобы weekly не превращался в длинный ручной разбор.</p>
        </div>
      </div>
      <div class="control-filters" style="margin-top:12px">
        <input id="productLeaderboardSearch" placeholder="Поиск по SKU, названию, owner, категории…" value="${escapeHtml(filters.search)}">
        <select id="productLeaderboardOwner">
          <option value="all" ${filters.owner === 'all' ? 'selected' : ''}>Все owner</option>
          ${payload.owners.map((owner) => `<option value="${escapeHtml(owner)}" ${filters.owner === owner ? 'selected' : ''}>${escapeHtml(owner)}</option>`).join('')}
        </select>
        <select id="productLeaderboardSignal">
          <option value="all" ${filters.signal === 'all' ? 'selected' : ''}>Все сигналы</option>
          ${['leader', 'steady', 'risk', 'no_owner', 'no_sales'].map((signal) => `<option value="${signal}" ${filters.signal === signal ? 'selected' : ''}>${escapeHtml(productLeaderboardSignalMeta(signal).label)}</option>`).join('')}
        </select>
        <select id="productLeaderboardSort">
          <option value="buys" ${filters.sort === 'buys' ? 'selected' : ''}>Сортировка: выкупы</option>
          <option value="orders" ${filters.sort === 'orders' ? 'selected' : ''}>Сортировка: заказы</option>
          <option value="revenue" ${filters.sort === 'revenue' ? 'selected' : ''}>Сортировка: выручка</option>
          <option value="income" ${filters.sort === 'income' ? 'selected' : ''}>Сортировка: доход</option>
          <option value="romiPct" ${filters.sort === 'romiPct' ? 'selected' : ''}>Сортировка: ROMI</option>
          <option value="ctrPct" ${filters.sort === 'ctrPct' ? 'selected' : ''}>Сортировка: CTR</option>
          <option value="drrPct" ${filters.sort === 'drrPct' ? 'selected' : ''}>Сортировка: ДРР</option>
          <option value="reach" ${filters.sort === 'reach' ? 'selected' : ''}>Сортировка: охват</option>
        </select>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>SKU и воронка</h3>
          <p class="small muted">В одной строке видно товар, owner, краткую воронку и экономику.</p>
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
              <th>Воронка</th>
              <th>CTR</th>
              <th>Конверсия</th>
              <th>Выручка</th>
              <th>Доход</th>
              <th>ROMI</th>
              <th>ДРР</th>
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
                  <td>
                    <div class="muted small">Охват ${fmt.int(item.reach)} · Клики ${fmt.int(item.clicks)}</div>
                    <div class="muted small">Корзина ${fmt.int(item.carts)} · Заказы ${fmt.int(item.orders)} · Выкупы ${fmt.int(item.buys)}</div>
                    <div class="muted small">ERview ${fmt.pct(item.erviewPct)} · Buyout ${fmt.pct(item.buyoutPct)}</div>
                  </td>
                  <td>${fmt.pct(item.ctrPct)}</td>
                  <td>${fmt.pct(item.conversionPct)}</td>
                  <td>${fmt.money(item.revenue)}</td>
                  <td>${fmt.money(item.income)}</td>
                  <td>${fmt.pct(item.romiPct)}</td>
                  <td>${fmt.pct(item.drrPct)}</td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="9"><div class="empty">По текущим фильтрам пока нет строк.</div></td></tr>'}
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
  root.querySelector('#productLeaderboardOwner')?.addEventListener('change', (event) => {
    getProductLeaderboardFilters().owner = event.target.value;
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
}

function renderLaunchItem(item) {
  return `
    <div class="list-item">
      <div class="head">
        <div>
          <strong>${item.articleKey ? linkToSku(item.articleKey, item.name || 'РќРѕРІРёРЅРєР°') : escapeHtml(item.name || 'РќРѕРІРёРЅРєР°')}</strong>
          <div class="muted small">${escapeHtml(item.reportGroup || 'вЂ”')} В· ${escapeHtml(item.subCategory || 'вЂ”')}</div>
        </div>
        ${badge(item.launchMonth || 'вЂ”', 'info')}
      </div>
      <div class="badge-stack">${badge(launchPhaseMeta(item.phase).label, launchPhaseMeta(item.phase).tone)}${item.production ? badge(item.production) : ''}${item.owner ? badge(item.owner, 'info') : badge('Р‘РµР· owner', 'warn')}</div>
      <div class="muted small" style="margin-top:8px">${escapeHtml(item.status || 'РЎС‚Р°С‚СѓСЃ РЅРµ СѓРєР°Р·Р°РЅ')}</div>
      <div class="muted small" style="margin-top:8px">РџР»Р°РЅ РІС‹СЂСѓС‡РєРё: ${fmt.money(item.plannedRevenue)} В· РўСЂР°С„РёРє: ${escapeHtml(item.externalTraffic || 'вЂ”')}</div>
      <div class="badge-stack" style="margin-top:8px">${badge(`${fmt.int(item.activeTasks || 0)} Р°РєС‚РёРІРЅ. Р·Р°РґР°С‡`, item.activeTasks ? 'warn' : 'ok')}${(item.blockers || []).slice(0, 2).map((text) => badge(text, 'warn')).join('')}</div>
    </div>
  `;
}

function renderLaunches() {
  const root = document.getElementById('view-launches');
  const model = getLaunchViewModel();

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>РќРѕРІРёРЅРєРё Рё pipeline</h2>
        <p>РЎРѕР±СЂР°Р»Р° product-layer РїРѕ SKU СЂРѕСЃС‚Р° Рё РЅРѕРІРёРЅРєР°Рј: РєР°СЂС‚РѕС‡РєР°, owner, СЌРєРѕРЅРѕРјРёРєР°, С‚СЂР°С„РёРє Рё С‚РµРєСѓС‰РёРµ Р±Р»РѕРєРµСЂС‹ РІ РѕРґРЅРѕРј РјРµСЃС‚Рµ.</p>
      </div>
      <div class="badge-stack">${badge(`${fmt.int(model.filteredItems.length)} SKU РІ С„РѕРєСѓСЃРµ`, model.filteredItems.length ? 'info' : 'warn')}${badge(`${fmt.int(model.filteredItems.filter((item) => !item.owner).length)} Р±РµР· owner`, model.filteredItems.filter((item) => !item.owner).length ? 'warn' : 'ok')}${badge(`${fmt.int(model.filteredItems.filter((item) => item.activeTasks).length)} СЃ Р°РєС‚РёРІРЅС‹РјРё Р·Р°РґР°С‡Р°РјРё`, model.filteredItems.filter((item) => item.activeTasks).length ? 'warn' : 'ok')}</div>
    </div>
    ${renderLaunchMonthFilters(model)}
    <div class="card" style="margin-top:14px">
      <div class="pipeline-strip">
        <span>Owner</span><span>РџРѕСЃС‚Р°РІРєР°</span><span>РљРѕРЅС‚РµРЅС‚</span><span>РўСЂР°С„РёРє</span><span>Р­РєРѕРЅРѕРјРёРєР°</span><span>РњР°СЃС€С‚Р°Р±</span>
      </div>
      <div class="muted small" style="margin-top:12px">РЎРЅР°С‡Р°Р»Р° С„РёР»СЊС‚СЂСѓРµРј РїРѕ РјРµСЃСЏС†Сѓ, РїРѕС‚РѕРј СЂР°Р·Р±РёСЂР°РµРј РєР°СЂС‚РѕС‡РєРё РІРЅСѓС‚СЂРё СЌС‚РѕРіРѕ РјРµСЃСЏС†Р°. РўР°Рє РљСЃРµРЅРёСЏ СЃРЅРѕРІР° РІРёРґРёС‚ pipeline Р±Р»РѕРєР°РјРё, Р° РЅРµ РѕРґРЅРѕР№ РґР»РёРЅРЅРѕР№ Р»РµРЅС‚РѕР№.</div>
    </div>
    ${model.sections.map((section) => `
      <div class="card" style="margin-top:14px">
        <div class="section-subhead">
          <div>
            <h3>${escapeHtml(section.label)}</h3>
            <p class="small muted">РљР°СЂС‚РѕС‡РєРё РЅРѕРІРёРЅРѕРє, РєРѕС‚РѕСЂС‹Рµ РѕС‚РЅРѕСЃСЏС‚СЃСЏ Рє СЌС‚РѕРјСѓ РјРµСЃСЏС†Сѓ Р·Р°РїСѓСЃРєР°.</p>
          </div>
          <div class="badge-stack">${badge(`${fmt.int(section.items.length)} SKU`, section.items.length ? 'info' : '')}${badge(`${fmt.int(section.items.filter((item) => !item.owner).length)} Р±РµР· owner`, section.items.filter((item) => !item.owner).length ? 'warn' : 'ok')}</div>
        </div>
        <div class="list" style="margin-top:14px">${section.items.map(renderLaunchItem).join('') || '<div class="empty">РќРµС‚ РЅРѕРІРёРЅРѕРє РІ СЌС‚РѕРј РјРµСЃСЏС†Рµ.</div>'}</div>
      </div>
    `).join('') || '<div class="card" style="margin-top:14px"><div class="empty">РќРµС‚ РЅРѕРІРёРЅРѕРє РІ С‚РµРєСѓС‰РµРј СЃСЂРµР·Рµ</div></div>'}
  `;

  bindLaunchMonthFilters(root);
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
        <h2>Р—Р°РїСѓСЃРє РЅРѕРІРёРЅРѕРє</h2>
        <p>РћС‚РґРµР»СЊРЅС‹Р№ СЌРєСЂР°РЅ Р·Р°РїСѓСЃРєР°: СЃРІРµСЂС…Сѓ РІРёРґРЅРѕ, РіРґРµ РёРјРµРЅРЅРѕ СЃРµР№С‡Р°СЃ Р±Р»РѕРєРёСЂСѓРµС‚СЃСЏ Р·Р°РїСѓСЃРє, Р° РЅРёР¶Рµ РјРѕР¶РЅРѕ РїСЂРѕР№С‚РёСЃСЊ РїРѕ SKU РєР°Рє РїРѕ С‡РµРє-Р»РёСЃС‚Сѓ.</p>
      </div>
      <div class="badge-stack">
        ${badge(`${fmt.int(items.length)} РІ Р·Р°РїСѓСЃРєРµ`, items.length ? 'info' : 'warn')}
        ${badge(`${fmt.int(items.filter((item) => item.phase === 'owner').length)} Р¶РґСѓС‚ owner`, items.filter((item) => item.phase === 'owner').length ? 'warn' : 'ok')}
        ${badge(`${fmt.int(items.filter((item) => item.phase === 'content').length)} Р¶РґСѓС‚ С‚СЂР°С„РёРє`, items.filter((item) => item.phase === 'content').length ? 'warn' : 'ok')}
      </div>
    </div>

    ${renderLaunchMonthFilters(model)}

    <div class="grid cards" style="margin-top:14px">
      ${groups.map((group) => `
        <div class="card kpi">
          <div class="label">${escapeHtml(group.meta.label)}</div>
          <div class="value">${fmt.int(group.items.length)}</div>
          <div class="hint">SKU РІ СЌС‚РѕР№ С„Р°Р·Рµ Р·Р°РїСѓСЃРєР°</div>
          <div class="badge-stack" style="margin-top:10px">${group.items.slice(0, 3).map((item) => badge(item.owner || item.name, item.owner ? '' : 'warn')).join('')}</div>
        </div>
      `).join('') || '<div class="card"><div class="empty">РќРµС‚ SKU РІ Р·Р°РїСѓСЃРєРµ</div></div>'}
    </div>

    ${groups.map((group) => `
      <div class="card" style="margin-top:14px">
        <div class="section-subhead">
          <div>
            <h3>${escapeHtml(group.meta.label)}</h3>
            <p class="small muted">Р§С‚Рѕ РЅР°РґРѕ Р·Р°РєСЂС‹С‚СЊ РЅР° СЌС‚РѕРј СЌС‚Р°РїРµ, С‡С‚РѕР±С‹ SKU РЅРµ Р·Р°РІРёСЃР°Р» РјРµР¶РґСѓ РѕС‚РґРµР»Р°РјРё.</p>
          </div>
          ${badge(`${fmt.int(group.items.length)} SKU`, group.meta.tone)}
        </div>
        <div class="list">
          ${group.items.map((item) => `
            <div class="list-item">
              <div class="head">
                <div>
                  <strong>${item.articleKey ? linkToSku(item.articleKey, item.name || 'РќРѕРІРёРЅРєР°') : escapeHtml(item.name || 'РќРѕРІРёРЅРєР°')}</strong>
                  <div class="muted small">${escapeHtml(item.subCategory || 'вЂ”')}</div>
                </div>
                <div class="badge-stack">${item.owner ? badge(item.owner, 'info') : badge('Р‘РµР· owner', 'warn')}${badge(`${fmt.int(item.activeTasks || 0)} Р·Р°РґР°С‡`, item.activeTasks ? 'warn' : 'ok')}</div>
              </div>
              <div class="check-list">
                <div class="check-item"><strong>1.</strong><span>${ownerName(getSku(item.articleKey)) ? 'Owner РЅР°Р·РЅР°С‡РµРЅ' : 'РќР°Р·РЅР°С‡РёС‚СЊ owner Рё Р·РѕРЅСѓ РѕС‚РІРµС‚СЃС‚РІРµРЅРЅРѕСЃС‚Рё'}</span></div>
                <div class="check-item"><strong>2.</strong><span>${totalSkuStock(getSku(item.articleKey)) > 0 ? `РћСЃС‚Р°С‚РѕРє РµСЃС‚СЊ: ${fmt.int(totalSkuStock(getSku(item.articleKey)))}` : 'РџСЂРѕРІРµСЂРёС‚СЊ РїРѕСЃС‚Р°РІРєСѓ Рё РґРѕСЃС‚СѓРїРЅРѕСЃС‚СЊ SKU'}</span></div>
                <div class="check-item"><strong>3.</strong><span>${getSku(item.articleKey)?.flags?.hasExternalTraffic ? `РўСЂР°С„РёРє РµСЃС‚СЊ: ${escapeHtml(item.externalTraffic)}` : 'РџРѕРґРіРѕС‚РѕРІРёС‚СЊ Р·Р°РїСѓСЃРє С‚СЂР°С„РёРєР° / РєРѕРЅС‚РµРЅС‚Р°'}</span></div>
                <div class="check-item"><strong>4.</strong><span>${(item.blockers || []).length ? `Р‘Р»РѕРєРµСЂС‹: ${escapeHtml(item.blockers.join(', '))}` : 'РљСЂРёС‚РёС‡РЅС‹С… Р±Р»РѕРєРµСЂРѕРІ РЅРµ РІРёРґРЅРѕ'}</span></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  `;

  bindLaunchMonthFilters(root);
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


