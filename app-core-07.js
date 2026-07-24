function skuModalArticleToken(value = '') {
  if (typeof skuPlanFactToken === 'function') return skuPlanFactToken(value);
  return String(value || '').trim().toLowerCase().replace(/[^a-zа-я0-9]+/gi, '');
}

function skuModalPlanFactContextForArticle(articleKey = '') {
  const preferredContext = state.activeSkuPlanFactContext || null;
  if (typeof window.skuPlanFactContextForArticle === 'function') {
    try {
      return window.skuPlanFactContextForArticle(articleKey, preferredContext);
    } catch (error) {
      console.warn('SKU plan-fact modal context failed', error);
    }
  }
  if (preferredContext?.articleKey && skuModalArticleToken(preferredContext.articleKey) === skuModalArticleToken(articleKey)) {
    return preferredContext;
  }
  return null;
}

function skuModalMetricNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function skuModalCanonicalMargin(articleKey = '', platform = '') {
  const articleToken = skuModalArticleToken(articleKey);
  const platformKey = String(platform || '').trim().toLowerCase();
  const row = (Array.isArray(state.canonicalRepricer?.rows) ? state.canonicalRepricer.rows : [])
    .find((item) => (
      skuModalArticleToken(item?.article_key || item?.articleKey) === articleToken
      && String(item?.platform || '').trim().toLowerCase() === platformKey
    ));
  const value = skuModalMetricNumber(row?.recommendation?.current_margin_pct);
  return {
    value,
    asOf: String(row?.facts?.as_of || '').trim(),
    freshness: String(row?.facts?.price_freshness || '').trim(),
    source: value === null ? '' : 'canonical IU'
  };
}

function skuModalPlanFactResultRows(context = {}) {
  const completion = skuModalMetricNumber(context.completionToDate);
  const gap = skuModalMetricNumber(context.gapToDate);
  const margin = skuModalMetricNumber(context.marginPct);
  const scope = [context.platformLabel || '', context.periodLabel || context.monthLabel || context.monthKey || '']
    .filter(Boolean)
    .join(' · ');
  const rows = [
    metricRow('Срез план-факта', escapeHtml(scope || 'Актуальный')),
    metricRow('План периода', `${fmt.int(context.planToDateUnits)} шт. · ${fmt.money(context.planToDateRevenue)}`),
    metricRow('Факт периода', `${fmt.int(context.factUnits)} шт. · ${fmt.money(context.factRevenue)}`)
  ];
  if (completion !== null) {
    rows.push(metricRow('Выполнение', fmt.pct(completion), completion < 0.9 ? 'danger-text' : (completion > 1.2 ? 'warn-text' : 'ok-text')));
  }
  if (gap !== null) {
    rows.push(metricRow('Разница к плану', fmt.money(gap), gap < 0 ? 'danger-text' : 'ok-text'));
  }
  if (margin !== null) {
    rows.push(metricRow(`${context.platformLabel || 'Площадка'} маржа`, fmt.pct(margin), margin < 0 ? 'danger-text' : ''));
  }
  return rows;
}

function skuModalLegacyResultRows(sku = {}, completion = {}) {
  const currentPlanUnits = firstFiniteValue(sku?.planFact?.planApr26Units);
  const currentFactUnits = firstFiniteValue(
    sku?.planFact?.factApr16Units,
    sku?.planFact?.factAprToDateUnits
  );
  const rows = [
    currentPlanUnits !== null
      ? metricRow('План Apr 26', fmt.int(currentPlanUnits))
      : metricRow('План Feb 26', fmt.int(sku.planFact?.planFeb26Units)),
    currentFactUnits !== null
      ? metricRow('Факт Apr to date', fmt.int(currentFactUnits))
      : metricRow('Факт Feb 26', fmt.int(sku.planFact?.factFeb26Units))
  ];

  if (completion.monthPct !== null) {
    rows.push(metricRow('Выполнение месяца', fmt.pct(completion.monthPct), completion.monthPct < 0.8 ? 'danger-text' : ''));
  } else if (completion.legacyPct !== null) {
    rows.push(metricRow('Выполнение Feb 26', fmt.pct(completion.legacyPct), completion.legacyPct < 0.8 ? 'danger-text' : ''));
  }

  if (completion.toDatePct !== null) {
    rows.push(metricRow('К плану на дату', fmt.pct(completion.toDatePct), completion.toDatePct < 0.85 ? 'warn-text' : ''));
  }

  return rows;
}

function renderSkuModal(articleKey) {
  const previousActiveSku = state.activeSku || '';
  const sku = getSku(articleKey);
  if (!sku) return;
  const resolvedArticleKey = skuPrimaryKey(sku, articleKey);
  state.activeSku = resolvedArticleKey;

  const body = document.getElementById('skuModalBody');
  const modal = document.getElementById('skuModal');
  const previousModalScroll = modal?.classList.contains('open') && previousActiveSku === resolvedArticleKey
    ? {
        modalTop: modal.scrollTop || 0,
        bodyTop: body?.scrollTop || 0
      }
    : null;
  const comments = getSkuComments(resolvedArticleKey);
  const decisions = getSkuDecisions(resolvedArticleKey);
  const tasks = getSkuControlTasks(resolvedArticleKey);
  const activeTask = nextTaskForSku(resolvedArticleKey);
  const owners = ownerOptions();
  const currentOwner = ownerName(sku);
  const currentOwnerOverride = (state.storage.ownerOverrides || [])
    .find((item) => item.articleKey === resolvedArticleKey) || {};
  const currentLifecycle = typeof productLifecycleForSku === 'function'
    ? productLifecycleForSku(sku, resolvedArticleKey)
    : { key: 'active', label: sku.status || 'Актуальный', tone: 'ok', note: '' };
  const currentLifecycleOverride = typeof productLifecycleOverrideForArticle === 'function'
    ? productLifecycleOverrideForArticle(resolvedArticleKey)
    : null;
  const lifecycleSourceLabel = ({
    manual: 'Ручное решение',
    auto: 'Авто-статус',
    productLifecycleStatus: 'Реестр SKU',
    lifecycleStatus: 'Реестр SKU',
    productStatus: 'Реестр SKU',
    sheetStatus: 'Реестр SKU',
    statusSku: 'Реестр SKU',
    registryStatus: 'Реестр SKU',
    'owner.registryStatus': 'Реестр owner',
    status: 'Реестр SKU',
    fallback: 'По умолчанию'
  })[currentLifecycle.source] || currentLifecycle.source || 'По данным SKU';
  const lifecycleReason = currentLifecycle.note || currentLifecycle.reason || currentLifecycle.description || '';
  const ownerSelectOptions = [...new Set([currentOwner, ...owners].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ru'));
  const completion = currentCompletionSnapshot(sku);
  const planFactContext = skuModalPlanFactContextForArticle(resolvedArticleKey);
  const resultRows = planFactContext
    ? skuModalPlanFactResultRows(planFactContext)
    : skuModalLegacyResultRows(sku, completion);
  const wbIuMargin = skuModalCanonicalMargin(resolvedArticleKey, 'wb');
  const ozonIuMargin = skuModalCanonicalMargin(resolvedArticleKey, 'ozon');
  const iuMarginAsOf = [wbIuMargin.asOf, ozonIuMargin.asOf].filter(Boolean).sort().at(-1) || '';

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
        ${metricRow('WB маржа ИУ', fmt.pct(wbIuMargin.value), (wbIuMargin.value || 0) < 0 ? 'danger-text' : '')}
        ${metricRow('Ozon маржа ИУ', fmt.pct(ozonIuMargin.value), (ozonIuMargin.value || 0) < 0 ? 'danger-text' : '')}
        <div class="muted small" style="margin-top:8px">Маржа ИУ = цена продавца − себестоимость − комиссия − издержки площадки − внутренняя реклама. Срез: ${escapeHtml(iuMarginAsOf || 'нет актуальной цены API')}.</div>
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
        <div class="note-box">${escapeHtmlMultiline(activeTask?.nextAction || 'Активной задачи пока нет.')}</div>
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
          <input type="hidden" name="articleKey" value="${escapeHtml(resolvedArticleKey)}">
          <input name="title" placeholder="Что делаем" required>
          <select name="type">${Object.entries(TASK_TYPE_META).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('')}</select>
          <select name="priority">${Object.entries(PRIORITY_META).map(([value, meta]) => `<option value="${value}">${escapeHtml(meta.label)}</option>`).join('')}</select>
          <select name="platform">
            <option value="cross">Общий контур</option>
            <option value="wb">РОП WB</option>
            <option value="ozon">РОП Ozon</option>
            <option value="ya">Я.Маркет</option>
            <option value="goldapple">Золотое яблоко</option>
            <option value="letu">Л'Этуаль</option>
            <option value="megamarket">Мегамаркет</option>
            <option value="samokat">Самокат</option>
            <option value="magnit">Магнит Маркет</option>
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
            <p class="small muted">Источник owner — Реестр SKU. Отсюда закрепление идёт во все разделы портала.</p>
          </div>
          <span class="owner-badge">${escapeHtml(ownerName(sku) || 'Не закреплён')}</span>
        </div>
        <datalist id="skuOwnerList">${ownerSelectOptions.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
        <form id="ownerForm" class="form-grid compact">
          <input name="ownerName" list="skuOwnerList" autocomplete="off" spellcheck="false" placeholder="Кто owner" value="${escapeHtml(currentOwner || '')}">
          <input name="ownerRole" autocomplete="off" spellcheck="false" placeholder="Роль / зона" value="${escapeHtml(currentOwnerOverride.ownerRole || (sku?.owner?.name ? (sku?.owner?.registryStatus || 'Owner SKU') : (sku?.owner?.registryStatus || '')))}">
          <textarea name="note" rows="3" placeholder="Что важно по закреплению / передаче SKU">${escapeHtml(currentOwnerOverride.note || '')}</textarea>
          <div class="quick-actions">
            <button class="btn" type="submit">Сохранить owner</button>
            <button class="btn ghost" type="button" id="clearOwnerBtn">Снять owner</button>
          </div>
        </form>
        <div class="modal-section-title" style="margin-top:14px">
          <div>
            <h3>Статус товара</h3>
            <p class="small muted">Единый lifecycle-статус для задач, цен и репрайсера.</p>
          </div>
          ${badge(currentLifecycle.label || 'Актуальный', currentLifecycle.tone || '')}
        </div>
        <div class="note-box"><strong>${escapeHtml(lifecycleSourceLabel)}</strong>${lifecycleReason ? `<div>${escapeHtml(lifecycleReason)}</div>` : ''}</div>
        <form id="productLifecycleForm" class="form-grid compact">
          <select name="status">${typeof productLifecycleOptionsHtml === 'function' ? productLifecycleOptionsHtml(currentLifecycle.key || currentLifecycle.label) : ''}<option value="__auto__">Снять ручной статус после согласования</option></select>
          <textarea name="note" rows="3" required minlength="8" placeholder="Основание для РОПа: цифры, причина, действие и срок"></textarea>
          <div class="quick-actions">
            <button class="btn" type="submit">Отправить РОПу</button>
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
          <input type="hidden" name="articleKey" value="${escapeHtml(resolvedArticleKey)}">
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
  if (previousModalScroll) {
    window.requestAnimationFrame(() => {
      modal.scrollTop = previousModalScroll.modalTop || 0;
      if (body) body.scrollTop = previousModalScroll.bodyTop || 0;
    });
  }

  body.querySelector('#manualTaskForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createManualTask({
      articleKey: resolvedArticleKey,
      title: form.get('title'),
      type: form.get('type'),
      priority: form.get('priority'),
      platform: form.get('platform'),
      owner: form.get('owner'),
      due: form.get('due'),
      nextAction: form.get('nextAction')
    });
    renderSkuModal(resolvedArticleKey);
    rerenderCurrentView();
  });

  body.querySelector('#ownerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await upsertOwnerAssignment({
      articleKey: resolvedArticleKey,
      ownerName: form.get('ownerName'),
      ownerRole: form.get('ownerRole'),
      note: form.get('note')
    });
    renderSkuModal(resolvedArticleKey);
    rerenderCurrentView();
  });

  body.querySelector('#clearOwnerBtn')?.addEventListener('click', async () => {
    await removeOwnerAssignment(resolvedArticleKey);
    renderSkuModal(resolvedArticleKey);
    rerenderCurrentView();
  });

  body.querySelector('#productLifecycleForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reason = String(form.get('note') || '').trim();
    if (reason.length < 8) return;
    if (typeof window.requestSkuDecisionApproval !== 'function') return;
    const selected = String(form.get('status') || '').trim();
    const clearOverride = selected === '__auto__';
    const proposedLifecycle = clearOverride
      ? (typeof productLifecycleAutoForSku === 'function' ? productLifecycleAutoForSku(sku, resolvedArticleKey) : productLifecycleMeta('active'))
      : productLifecycleMeta(selected);
    const pending = typeof window.skuDecisionPendingForArticle === 'function'
      ? window.skuDecisionPendingForArticle(resolvedArticleKey, 'PRODUCT_STATUS_CHANGE', 'all')
      : null;
    if (pending) {
      window.alert('По этому SKU уже есть решение, ожидающее РОПа.');
      return;
    }
    await window.requestSkuDecisionApproval({
      type: 'PRODUCT_STATUS_CHANGE',
      articleKey: resolvedArticleKey,
      platform: state.filters?.market || 'all',
      currentValue: currentLifecycle.label || currentLifecycle.key || '—',
      proposedValue: proposedLifecycle.label || proposedLifecycle.key || 'Авто',
      reason,
      payload: {
        currentStatusKey: currentLifecycle.key || 'active',
        proposedStatusKey: proposedLifecycle.key || 'active',
        proposedStatusLabel: proposedLifecycle.label || 'Авто',
        clearOverride
      }
    });
    window.alert('Задача РОПу создана. До подтверждения статус не изменится.');
    renderSkuModal(resolvedArticleKey);
    rerenderCurrentView();
  });

  body.querySelector('#decisionForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createDecision({
      articleKey: resolvedArticleKey,
      title: form.get('title'),
      decision: form.get('decision'),
      owner: form.get('owner'),
      status: form.get('status'),
      due: form.get('due')
    });
    renderSkuModal(resolvedArticleKey);
    rerenderCurrentView();
  });

  body.querySelector('#commentForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createComment({
      articleKey: resolvedArticleKey,
      author: form.get('author'),
      team: teamMemberLabel(),
      type: form.get('type'),
      text: form.get('text')
    });
    renderSkuModal(resolvedArticleKey);
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
  const normalized = String(label || '').trim().toLowerCase();
  const match = normalized.match(/^([а-яё]+)\s+(\d{4})$/i) || normalized.match(/([а-яё]+)\s+(\d{4})/i);
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

function launchIdentityToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\u0451/g, '\u0435')
    .replace(/[^a-z0-9\u0430-\u044f]+/g, '');
}

function launchIdentityTokens(item = {}) {
  const tokens = [];
  const article = launchIdentityToken(item.articleKey || item.article || item.sku || '');
  const name = launchIdentityToken(item.name || item.title || '');
  const group = launchIdentityToken(item.reportGroup || item.category || item.subCategory || item.segment || '');
  const sourceRow = launchIdentityToken(item.sourceRow || '');
  if (article) tokens.push(`article:${article}`);
  if (name && group) tokens.push(`name-group:${name}|${group}`);
  if (name && name.length >= 5) tokens.push(`name:${name}`);
  if (sourceRow) tokens.push(`source:${sourceRow}`);
  return [...new Set(tokens)];
}

function launchArticleIdentity(item = {}) {
  return launchIdentityTokens(item).find((token) => token.startsWith('article:')) || '';
}

function launchSharesIdentity(left = {}, right = {}) {
  const leftArticle = launchArticleIdentity(left);
  const rightArticle = launchArticleIdentity(right);
  if (leftArticle || rightArticle) return Boolean(leftArticle && leftArticle === rightArticle);
  const rightTokens = new Set(launchIdentityTokens(right));
  return launchIdentityTokens(left).some((token) => token.startsWith('name') && rightTokens.has(token));
}

function launchOverrideIdentityMap(overrides = []) {
  const map = new Map();
  overrides.forEach((item) => {
    launchIdentityTokens(item).forEach((token) => {
      if (!map.has(token)) map.set(token, item);
    });
  });
  return map;
}

function findLaunchOverrideForItem(item = {}, overrideMap = new Map(), identityMap = new Map(), usedOverrideIds = new Set()) {
  const direct = overrideMap.get(launchStableId(item));
  if (direct && !usedOverrideIds.has(launchStableId(direct))) return direct;
  for (const token of launchIdentityTokens(item)) {
    const candidate = identityMap.get(token);
    if (!candidate) continue;
    if (usedOverrideIds.has(launchStableId(candidate))) continue;
    if (launchSharesIdentity(item, candidate)) return candidate;
  }
  return null;
}

function launchDueDateKey(item = {}) {
  const exact = String(item?.launchDate || item?.firstStockDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(exact)) return exact;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(item?.launchDateKey || '').trim())) return String(item.launchDateKey).trim();
  return launchMonthDateKey(item?.launchMonth || '');
}

function launchDueDateLabel(item = {}) {
  const exact = String(item?.launchDate || item?.firstStockDate || '').trim();
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
    productFileUrl: String(item.productFileUrl || item.productFile || item.briefUrl || item.presentationUrl || item.fileUrl || '').trim(),
    firstStockDate: String(item.firstStockDate || item.firstWarehouseDate || item.warehouseDate || item.supplyDate || item.stockDate || item.launchDate || '').trim(),
    mpStockDate: String(item.mpStockDate || item.marketplaceStockDate || item.marketplaceWarehouseDate || item.mpWarehouseDate || item.marketplaceArrivalDate || item.stockMpDate || '').trim(),
    repeatOrderDate: String(item.repeatOrderDate || item.nextOrderDate || item.plannedReorderDate || item.reorderDate || item.firstRepeatOrderDate || '').trim(),
    marketingLead: String(item.marketingLead || item.marketingManager || item.leadOwner || '').trim(),
    marketingOwner: String(item.marketingOwner || item.marketer || '').trim(),
    prOwner: String(item.prOwner || item.smmOwner || item.contentOwner || '').trim(),
    logistOwner: String(item.logistOwner || item.logisticsOwner || item.supplyOwner || item.logist || '').trim(),
    kzOwner: String(item.kzOwner || item.selfBuyOwner || item.buyoutOwner || '').trim(),
    ropOwner: String(item.ropOwner || item.salesOwner || item.commercialOwner || '').trim(),
    reportGroup: String(item.reportGroup || item.segment || 'Продукт').trim() || 'Продукт',
    tag: String(item.tag || 'без тега').trim() || 'без тега',
    skuBucket: String(item.skuBucket || '').trim(),
    productType: String(item.productType || '').trim(),
    productVersion: String(item.productVersion || 'v1').trim() || 'v1',
    versionReason: String(item.versionReason || '').trim(),
    launchMonth,
    launchDate: String(item.launchDate || '').trim(),
    status: String(item.status || '').trim(),
    launchDecision: String(item.launchDecision || '').trim(),
    launchDecisionReason: String(item.launchDecisionReason || '').trim(),
    production: String(item.production || '').trim(),
    supplierName: String(item.supplierName || '').trim(),
    factoryName: String(item.factoryName || '').trim(),
    supplierContact: String(item.supplierContact || '').trim(),
    negotiationStatus: String(item.negotiationStatus || '').trim(),
    negotiationOwner: String(item.negotiationOwner || '').trim(),
    negotiationDue: String(item.negotiationDue || '').trim(),
    negotiationSince: String(item.negotiationSince || '').trim(),
    negotiationComment: String(item.negotiationComment || '').trim(),
    sampleStatus: String(item.sampleStatus || '').trim(),
    sampleOwner: String(item.sampleOwner || '').trim(),
    sampleDue: String(item.sampleDue || '').trim(),
    sampleSince: String(item.sampleSince || '').trim(),
    sampleComment: String(item.sampleComment || '').trim(),
    productionStatus: String(item.productionStatus || '').trim(),
    productionOwner: String(item.productionOwner || '').trim(),
    productionDue: String(item.productionDue || '').trim(),
    productionSince: String(item.productionSince || '').trim(),
    productionComment: String(item.productionComment || '').trim(),
    packagingStatus: String(item.packagingStatus || '').trim(),
    packagingOwner: String(item.packagingOwner || '').trim(),
    packagingDue: String(item.packagingDue || '').trim(),
    packagingSince: String(item.packagingSince || '').trim(),
    packagingComment: String(item.packagingComment || '').trim(),
    contentStatus: String(item.contentStatus || '').trim(),
    contentOwner: String(item.contentOwner || '').trim(),
    contentDue: String(item.contentDue || '').trim(),
    contentSince: String(item.contentSince || '').trim(),
    contentComment: String(item.contentComment || '').trim(),
    launchReadinessStatus: String(item.launchReadinessStatus || '').trim(),
    launchReadinessOwner: String(item.launchReadinessOwner || '').trim(),
    launchReadinessDue: String(item.launchReadinessDue || '').trim(),
    launchReadinessSince: String(item.launchReadinessSince || '').trim(),
    launchReadinessComment: String(item.launchReadinessComment || '').trim(),
    decisionLog: String(item.decisionLog || '').trim(),
    productComment: String(item.productComment || '').trim(),
    name: String(item.name || item.title || 'Новинка').trim() || 'Новинка',
    subCategory: String(item.subCategory || item.category || '').trim(),
    characteristic: String(item.characteristic || '').trim(),
    category: String(item.category || item.subCategory || '').trim(),
    marketplaces: String(item.marketplaces || '').trim(),
    registryStatus: String(item.registryStatus || '').trim(),
    segment: String(item.segment || '').trim(),
    presentationUrl: String(item.presentationUrl || item.productFileUrl || item.productFile || item.briefUrl || '').trim(),
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
  state.storage.launchOverrides = (state.storage.launchOverrides || []).filter((entry) => launchStableId(entry) !== draft.id && !launchSharesIdentity(entry, draft));
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

function launchOwnerValue(value = '') {
  return typeof canonicalOwnerName === 'function'
    ? canonicalOwnerName(value || '')
    : String(value || '').trim();
}

function launchCurrentOwner(item) {
  const explicitOwner = launchOwnerValue(item?.owner || '');
  if (explicitOwner) return explicitOwner;
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
  if (!Array.isArray(item?.ganttMonths) || !item.ganttMonths.length) blockers.push('не заполнен календарь запуска');
  if (soonLaunch && !String(item?.presentationUrl || item?.productFileUrl || item?.productFile || item?.briefUrl || '').trim()) blockers.push('нет презентации / материалов');
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
    productType: item.productType || '',
    productVersion: item.productVersion || 'v1',
    versionReason: item.versionReason || '',
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
    launchDecision: item.launchDecision || '',
    launchDecisionReason: item.launchDecisionReason || '',
    phase,
    owner,
    productFileUrl: String(item.productFileUrl || item.productFile || item.briefUrl || item.presentationUrl || item.fileUrl || '').trim(),
    firstStockDate: String(item.firstStockDate || item.firstWarehouseDate || item.warehouseDate || item.supplyDate || item.stockDate || item.launchDate || '').trim(),
    mpStockDate: String(item.mpStockDate || item.marketplaceStockDate || item.marketplaceWarehouseDate || item.mpWarehouseDate || item.marketplaceArrivalDate || item.stockMpDate || '').trim(),
    repeatOrderDate: String(item.repeatOrderDate || item.nextOrderDate || item.plannedReorderDate || item.reorderDate || item.firstRepeatOrderDate || '').trim(),
    marketingLead: launchOwnerValue(item.marketingLead || item.marketingManager || item.leadOwner || ''),
    marketingOwner: launchOwnerValue(item.marketingOwner || item.marketer || ''),
    prOwner: launchOwnerValue(item.prOwner || item.smmOwner || item.contentOwner || ''),
    logistOwner: launchOwnerValue(item.logistOwner || item.logisticsOwner || item.supplyOwner || item.logist || ''),
    kzOwner: launchOwnerValue(item.kzOwner || item.selfBuyOwner || item.buyoutOwner || ''),
    ropOwner: launchOwnerValue(item.ropOwner || item.salesOwner || item.commercialOwner || ''),
    production: item.production || '',
    supplierName: item.supplierName || '',
    factoryName: item.factoryName || '',
    supplierContact: item.supplierContact || '',
    negotiationStatus: item.negotiationStatus || '',
    negotiationOwner: launchOwnerValue(item.negotiationOwner || ''),
    negotiationDue: item.negotiationDue || '',
    negotiationSince: item.negotiationSince || '',
    negotiationComment: item.negotiationComment || '',
    sampleStatus: item.sampleStatus || '',
    sampleOwner: launchOwnerValue(item.sampleOwner || ''),
    sampleDue: item.sampleDue || '',
    sampleSince: item.sampleSince || '',
    sampleComment: item.sampleComment || '',
    productionStatus: item.productionStatus || '',
    productionOwner: launchOwnerValue(item.productionOwner || ''),
    productionDue: item.productionDue || '',
    productionSince: item.productionSince || '',
    productionComment: item.productionComment || '',
    packagingStatus: item.packagingStatus || '',
    packagingOwner: launchOwnerValue(item.packagingOwner || ''),
    packagingDue: item.packagingDue || '',
    packagingSince: item.packagingSince || '',
    packagingComment: item.packagingComment || '',
    contentStatus: item.contentStatus || '',
    contentOwner: launchOwnerValue(item.contentOwner || ''),
    contentDue: item.contentDue || '',
    contentSince: item.contentSince || '',
    contentComment: item.contentComment || '',
    launchReadinessStatus: item.launchReadinessStatus || '',
    launchReadinessOwner: launchOwnerValue(item.launchReadinessOwner || ''),
    launchReadinessDue: item.launchReadinessDue || '',
    launchReadinessSince: item.launchReadinessSince || '',
    launchReadinessComment: item.launchReadinessComment || '',
    decisionLog: item.decisionLog || '',
    productComment: item.productComment || '',
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
    presentationUrl: String(item.presentationUrl || item.productFileUrl || item.productFile || item.briefUrl || '').trim(),
    notes: String(item.notes || '').trim(),
    skuSuggestions: options.includeSkuSuggestions ? getLaunchSkuSuggestions(item, 3) : (Array.isArray(item.skuSuggestions) ? item.skuSuggestions : []),
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
  const overrideIdentityMap = launchOverrideIdentityMap([...overrideMap.values()]);
  const usedOverrideIds = new Set();
  const deletedIds = getLaunchDeletedIdSet();
  const baseIds = new Set();
  const merged = [];
  source.forEach((item) => {
    const launchId = launchStableId(item);
    baseIds.add(launchId);
    if (deletedIds.has(launchId)) return;
    const override = findLaunchOverrideForItem(item, overrideMap, overrideIdentityMap, usedOverrideIds);
    if (override) {
      usedOverrideIds.add(launchStableId(override));
      merged.push(normalizeLaunchItem({ ...item, ...override, id: launchId }, options));
    } else {
      merged.push(item);
    }
  });
  overrideMap.forEach((item, launchId) => {
    if (baseIds.has(launchId) || usedOverrideIds.has(launchId) || deletedIds.has(launchId)) return;
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
  return launchReadinessState(item).ready
    && launchFinalDecisionApproved(item)
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
    'no-gantt': 'Без календаря'
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
    production: item.production || '',
    supplier_name: item.supplierName || '',
    factory_name: item.factoryName || '',
    supplier_contact: item.supplierContact || '',
    negotiation_status: item.negotiationStatus || '',
    negotiation_owner: item.negotiationOwner || '',
    negotiation_due: item.negotiationDue || '',
    negotiation_since: item.negotiationSince || '',
    negotiation_comment: item.negotiationComment || '',
    sample_status: item.sampleStatus || '',
    sample_owner: item.sampleOwner || '',
    sample_due: item.sampleDue || '',
    sample_since: item.sampleSince || '',
    sample_comment: item.sampleComment || '',
    production_status: item.productionStatus || '',
    production_owner: item.productionOwner || '',
    production_due: item.productionDue || '',
    production_since: item.productionSince || '',
    production_comment: item.productionComment || '',
    packaging_status: item.packagingStatus || '',
    packaging_owner: item.packagingOwner || '',
    packaging_due: item.packagingDue || '',
    packaging_since: item.packagingSince || '',
    packaging_comment: item.packagingComment || '',
    content_status: item.contentStatus || '',
    content_owner: item.contentOwner || '',
    content_due: item.contentDue || '',
    content_since: item.contentSince || '',
    content_comment: item.contentComment || '',
    launch_readiness_status: item.launchReadinessStatus || '',
    launch_readiness_owner: item.launchReadinessOwner || '',
    launch_readiness_due: item.launchReadinessDue || '',
    launch_readiness_since: item.launchReadinessSince || '',
    launch_readiness_comment: item.launchReadinessComment || '',
    decision_log: item.decisionLog || '',
    product_comment: item.productComment || '',
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
    ['product_type', 'Тип продукта'],
    ['product_version', 'Версия продукта'],
    ['version_reason', 'Что изменилось в версии'],
    ['launch_month', 'Месяц запуска'],
    ['launch_date', 'Точная дата запуска'],
    ['status', 'Статус'],
    ['launch_decision', 'Решение по запуску'],
    ['launch_decision_reason', 'Причина решения'],
    ['phase', 'Этап'],
    ['production', 'Производство'],
    ['supplier_name', 'Поставщик'],
    ['factory_name', 'Завод'],
    ['supplier_contact', 'Контакт поставщика'],
    ['negotiation_status', 'Статус переговоров'],
    ['negotiation_owner', 'Ответственный за переговоры'],
    ['negotiation_due', 'Срок переговоров'],
    ['negotiation_since', 'В этапе переговоров с'],
    ['negotiation_comment', 'Комментарий по переговорам'],
    ['sample_status', 'Статус образца'],
    ['sample_owner', 'Ответственный за образец'],
    ['sample_due', 'Срок образца'],
    ['sample_since', 'В этапе образца с'],
    ['sample_comment', 'Комментарий по образцу'],
    ['production_status', 'Статус производства'],
    ['production_owner', 'Ответственный за производство'],
    ['production_due', 'Срок производства'],
    ['production_since', 'В этапе производства с'],
    ['production_comment', 'Комментарий по производству'],
    ['packaging_status', 'Статус упаковки / документов'],
    ['packaging_owner', 'Ответственный за упаковку / документы'],
    ['packaging_due', 'Срок упаковки / документов'],
    ['packaging_since', 'В этапе упаковки с'],
    ['packaging_comment', 'Комментарий по упаковке / документам'],
    ['content_status', 'Статус карточки / SKU'],
    ['content_owner', 'Ответственный за карточку / SKU'],
    ['content_due', 'Срок карточки / SKU'],
    ['content_since', 'В этапе карточки с'],
    ['content_comment', 'Комментарий по карточке / SKU'],
    ['launch_readiness_status', 'Статус запуска'],
    ['launch_readiness_owner', 'Ответственный за запуск'],
    ['launch_readiness_due', 'Срок запуска'],
    ['launch_readiness_since', 'В этапе запуска с'],
    ['launch_readiness_comment', 'Комментарий по запуску'],
    ['decision_log', 'Журнал решений'],
    ['product_comment', 'Комментарий по продукту'],
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
    ['gantt', 'Календарь запуска']
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
    product_type: item.productType || '',
    product_version: item.productVersion || '',
    version_reason: item.versionReason || '',
    launch_month: item.launchMonth || '',
    launch_date: item.launchDate || '',
    status: item.status || '',
    launch_decision: item.launchDecision || '',
    launch_decision_reason: item.launchDecisionReason || '',
    production: item.production || '',
    supplier_name: item.supplierName || '',
    factory_name: item.factoryName || '',
    supplier_contact: item.supplierContact || '',
    negotiation_status: item.negotiationStatus || '',
    negotiation_owner: item.negotiationOwner || '',
    negotiation_due: item.negotiationDue || '',
    negotiation_since: item.negotiationSince || '',
    negotiation_comment: item.negotiationComment || '',
    sample_status: item.sampleStatus || '',
    sample_owner: item.sampleOwner || '',
    sample_due: item.sampleDue || '',
    sample_since: item.sampleSince || '',
    sample_comment: item.sampleComment || '',
    production_status: item.productionStatus || '',
    production_owner: item.productionOwner || '',
    production_due: item.productionDue || '',
    production_since: item.productionSince || '',
    production_comment: item.productionComment || '',
    packaging_status: item.packagingStatus || '',
    packaging_owner: item.packagingOwner || '',
    packaging_due: item.packagingDue || '',
    packaging_since: item.packagingSince || '',
    packaging_comment: item.packagingComment || '',
    content_status: item.contentStatus || '',
    content_owner: item.contentOwner || '',
    content_due: item.contentDue || '',
    content_since: item.contentSince || '',
    content_comment: item.contentComment || '',
    launch_readiness_status: item.launchReadinessStatus || '',
    launch_readiness_owner: item.launchReadinessOwner || '',
    launch_readiness_due: item.launchReadinessDue || '',
    launch_readiness_since: item.launchReadinessSince || '',
    launch_readiness_comment: item.launchReadinessComment || '',
    decision_log: item.decisionLog || '',
    product_comment: item.productComment || '',
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
    ['product_type', 'Тип продукта'],
    ['product_version', 'Версия продукта'],
    ['version_reason', 'Что изменилось в версии'],
    ['launch_month', 'Месяц запуска'],
    ['launch_date', 'Точная дата запуска'],
    ['status', 'Статус'],
    ['launch_decision', 'Решение по запуску'],
    ['launch_decision_reason', 'Причина решения'],
    ['production', 'Производство'],
    ['supplier_name', 'Поставщик'],
    ['factory_name', 'Завод'],
    ['supplier_contact', 'Контакт поставщика'],
    ['negotiation_status', 'Статус переговоров'],
    ['negotiation_owner', 'Ответственный за переговоры'],
    ['negotiation_due', 'Срок переговоров'],
    ['negotiation_since', 'В этапе переговоров с'],
    ['negotiation_comment', 'Комментарий по переговорам'],
    ['sample_status', 'Статус образца'],
    ['sample_owner', 'Ответственный за образец'],
    ['sample_due', 'Срок образца'],
    ['sample_since', 'В этапе образца с'],
    ['sample_comment', 'Комментарий по образцу'],
    ['production_status', 'Статус производства'],
    ['production_owner', 'Ответственный за производство'],
    ['production_due', 'Срок производства'],
    ['production_since', 'В этапе производства с'],
    ['production_comment', 'Комментарий по производству'],
    ['packaging_status', 'Статус упаковки / документов'],
    ['packaging_owner', 'Ответственный за упаковку / документы'],
    ['packaging_due', 'Срок упаковки / документов'],
    ['packaging_since', 'В этапе упаковки с'],
    ['packaging_comment', 'Комментарий по упаковке / документам'],
    ['content_status', 'Статус карточки / SKU'],
    ['content_owner', 'Ответственный за карточку / SKU'],
    ['content_due', 'Срок карточки / SKU'],
    ['content_since', 'В этапе карточки с'],
    ['content_comment', 'Комментарий по карточке / SKU'],
    ['launch_readiness_status', 'Статус запуска'],
    ['launch_readiness_owner', 'Ответственный за запуск'],
    ['launch_readiness_due', 'Срок запуска'],
    ['launch_readiness_since', 'В этапе запуска с'],
    ['launch_readiness_comment', 'Комментарий по запуску'],
    ['decision_log', 'Журнал решений'],
    ['product_comment', 'Комментарий по продукту'],
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
  columns.push(['gantt', 'Календарь запуска']);
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
    productType: findColumn('product_type', 'тип_продукта'),
    productVersion: findColumn('product_version', 'версия_продукта'),
    versionReason: findColumn('version_reason', 'что_изменилось_в_версии'),
    launchMonth: findColumn('launch_month', 'месяц_запуска'),
    launchDate: findColumn('launch_date', 'точная_дата_запуска'),
    status: findColumn('status', 'статус'),
    launchDecision: findColumn('launch_decision', 'решение_по_запуску'),
    launchDecisionReason: findColumn('launch_decision_reason', 'причина_решения'),
    production: findColumn('production', 'производство'),
    supplierName: findColumn('supplier_name', 'поставщик'),
    factoryName: findColumn('factory_name', 'завод', 'фабрика'),
    supplierContact: findColumn('supplier_contact', 'контакт_поставщика', 'контакт'),
    negotiationStatus: findColumn('negotiation_status', 'статус_переговоров', 'переговоры_статус'),
    negotiationOwner: findColumn('negotiation_owner', 'ответственный_за_переговоры'),
    negotiationDue: findColumn('negotiation_due', 'срок_переговоров'),
    negotiationSince: findColumn('negotiation_since', 'в_этапе_переговоров_с'),
    negotiationComment: findColumn('negotiation_comment', 'комментарий_по_переговорам', 'переговоры'),
    sampleStatus: findColumn('sample_status', 'статус_образца'),
    sampleOwner: findColumn('sample_owner', 'ответственный_за_образец'),
    sampleDue: findColumn('sample_due', 'срок_образца'),
    sampleSince: findColumn('sample_since', 'в_этапе_образца_с'),
    sampleComment: findColumn('sample_comment', 'комментарий_по_образцу'),
    productionStatus: findColumn('production_status', 'статус_производства'),
    productionOwner: findColumn('production_owner', 'ответственный_за_производство'),
    productionDue: findColumn('production_due', 'срок_производства'),
    productionSince: findColumn('production_since', 'в_этапе_производства_с'),
    productionComment: findColumn('production_comment', 'комментарий_по_производству'),
    packagingStatus: findColumn('packaging_status', 'статус_упаковки___документов', 'статус_упаковки_документов'),
    packagingOwner: findColumn('packaging_owner', 'ответственный_за_упаковку___документы', 'ответственный_за_упаковку_документы'),
    packagingDue: findColumn('packaging_due', 'срок_упаковки___документов', 'срок_упаковки_документов'),
    packagingSince: findColumn('packaging_since', 'в_этапе_упаковки_с'),
    packagingComment: findColumn('packaging_comment', 'комментарий_по_упаковке___документам', 'комментарий_по_упаковке_документам'),
    contentStatus: findColumn('content_status', 'статус_карточки___sku', 'статус_карточки_sku'),
    contentOwner: findColumn('content_owner', 'ответственный_за_карточку___sku', 'ответственный_за_карточку_sku'),
    contentDue: findColumn('content_due', 'срок_карточки___sku', 'срок_карточки_sku'),
    contentSince: findColumn('content_since', 'в_этапе_карточки_с'),
    contentComment: findColumn('content_comment', 'комментарий_по_карточке___sku', 'комментарий_по_карточке_sku'),
    launchReadinessStatus: findColumn('launch_readiness_status', 'статус_запуска'),
    launchReadinessOwner: findColumn('launch_readiness_owner', 'ответственный_за_запуск'),
    launchReadinessDue: findColumn('launch_readiness_due', 'срок_запуска'),
    launchReadinessSince: findColumn('launch_readiness_since', 'в_этапе_запуска_с'),
    launchReadinessComment: findColumn('launch_readiness_comment', 'комментарий_по_запуску'),
    decisionLog: findColumn('decision_log', 'журнал_решений'),
    productComment: findColumn('product_comment', 'комментарий_по_продукту', 'комментарий_продукта'),
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
      productType: indexes.productType >= 0 ? row[indexes.productType] : '',
      productVersion: indexes.productVersion >= 0 ? row[indexes.productVersion] : '',
      versionReason: indexes.versionReason >= 0 ? row[indexes.versionReason] : '',
      launchMonth: indexes.launchMonth >= 0 ? row[indexes.launchMonth] : '',
      launchDate: indexes.launchDate >= 0 ? row[indexes.launchDate] : '',
      status: indexes.status >= 0 ? row[indexes.status] : '',
      launchDecision: indexes.launchDecision >= 0 ? row[indexes.launchDecision] : '',
      launchDecisionReason: indexes.launchDecisionReason >= 0 ? row[indexes.launchDecisionReason] : '',
      production: indexes.production >= 0 ? row[indexes.production] : '',
      supplierName: indexes.supplierName >= 0 ? row[indexes.supplierName] : '',
      factoryName: indexes.factoryName >= 0 ? row[indexes.factoryName] : '',
      supplierContact: indexes.supplierContact >= 0 ? row[indexes.supplierContact] : '',
      negotiationStatus: indexes.negotiationStatus >= 0 ? row[indexes.negotiationStatus] : '',
      negotiationOwner: indexes.negotiationOwner >= 0 ? row[indexes.negotiationOwner] : '',
      negotiationDue: indexes.negotiationDue >= 0 ? row[indexes.negotiationDue] : '',
      negotiationSince: indexes.negotiationSince >= 0 ? row[indexes.negotiationSince] : '',
      negotiationComment: indexes.negotiationComment >= 0 ? row[indexes.negotiationComment] : '',
      sampleStatus: indexes.sampleStatus >= 0 ? row[indexes.sampleStatus] : '',
      sampleOwner: indexes.sampleOwner >= 0 ? row[indexes.sampleOwner] : '',
      sampleDue: indexes.sampleDue >= 0 ? row[indexes.sampleDue] : '',
      sampleSince: indexes.sampleSince >= 0 ? row[indexes.sampleSince] : '',
      sampleComment: indexes.sampleComment >= 0 ? row[indexes.sampleComment] : '',
      productionStatus: indexes.productionStatus >= 0 ? row[indexes.productionStatus] : '',
      productionOwner: indexes.productionOwner >= 0 ? row[indexes.productionOwner] : '',
      productionDue: indexes.productionDue >= 0 ? row[indexes.productionDue] : '',
      productionSince: indexes.productionSince >= 0 ? row[indexes.productionSince] : '',
      productionComment: indexes.productionComment >= 0 ? row[indexes.productionComment] : '',
      packagingStatus: indexes.packagingStatus >= 0 ? row[indexes.packagingStatus] : '',
      packagingOwner: indexes.packagingOwner >= 0 ? row[indexes.packagingOwner] : '',
      packagingDue: indexes.packagingDue >= 0 ? row[indexes.packagingDue] : '',
      packagingSince: indexes.packagingSince >= 0 ? row[indexes.packagingSince] : '',
      packagingComment: indexes.packagingComment >= 0 ? row[indexes.packagingComment] : '',
      contentStatus: indexes.contentStatus >= 0 ? row[indexes.contentStatus] : '',
      contentOwner: indexes.contentOwner >= 0 ? row[indexes.contentOwner] : '',
      contentDue: indexes.contentDue >= 0 ? row[indexes.contentDue] : '',
      contentSince: indexes.contentSince >= 0 ? row[indexes.contentSince] : '',
      contentComment: indexes.contentComment >= 0 ? row[indexes.contentComment] : '',
      launchReadinessStatus: indexes.launchReadinessStatus >= 0 ? row[indexes.launchReadinessStatus] : '',
      launchReadinessOwner: indexes.launchReadinessOwner >= 0 ? row[indexes.launchReadinessOwner] : '',
      launchReadinessDue: indexes.launchReadinessDue >= 0 ? row[indexes.launchReadinessDue] : '',
      launchReadinessSince: indexes.launchReadinessSince >= 0 ? row[indexes.launchReadinessSince] : '',
      launchReadinessComment: indexes.launchReadinessComment >= 0 ? row[indexes.launchReadinessComment] : '',
      decisionLog: indexes.decisionLog >= 0 ? row[indexes.decisionLog] : '',
      productComment: indexes.productComment >= 0 ? row[indexes.productComment] : '',
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

function ensureLaunchImportPreviewModal() {
  let modal = document.getElementById('launchImportPreviewModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'launchImportPreviewModal';
  modal.className = 'modal';
  modal.innerHTML = '<div class="modal-card launch-import-preview-card" id="launchImportPreviewBody"></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', (event) => {
    if (event.target?.id === 'launchImportPreviewModal') closeLaunchImportPreview();
  });
  return modal;
}

function closeLaunchImportPreview() {
  document.getElementById('launchImportPreviewModal')?.classList.remove('open');
}

function launchImportExistingItem(row = {}, existingItems = []) {
  const rowId = launchStableId(row);
  const rowArticle = String(row.articleKey || '').trim();
  const rowName = String(row.name || '').trim().toLowerCase();
  return existingItems.find((item) => item.id === rowId)
    || existingItems.find((item) => rowArticle && item.articleKey === rowArticle)
    || existingItems.find((item) => rowName && String(item.name || '').trim().toLowerCase() === rowName)
    || null;
}

function launchImportDiff(existing = {}, row = {}) {
  const fields = [
    ['name', 'товар'],
    ['launchMonth', 'месяц'],
    ['launchDate', 'дата'],
    ['owner', 'owner'],
    ['supplierName', 'поставщик'],
    ['factoryName', 'завод'],
    ['negotiationStatus', 'переговоры'],
    ['launchDecision', 'решение'],
    ['status', 'статус']
  ];
  return fields
    .filter(([key]) => String(existing?.[key] || '').trim() !== String(row?.[key] || '').trim())
    .map(([, label]) => label);
}

function showLaunchImportPreview(parsedRows = []) {
  const existingItems = getLaunchItems({ skipTaskLookup: true });
  const previewRows = parsedRows.map((row) => {
    const existing = launchImportExistingItem(row, existingItems);
    return {
      row,
      existing,
      mode: existing ? 'update' : 'new',
      diff: existing ? launchImportDiff(existing, row) : []
    };
  });
  const created = previewRows.filter((row) => row.mode === 'new').length;
  const updated = previewRows.filter((row) => row.mode === 'update').length;
  const changed = previewRows.filter((row) => row.diff.length).length;
  const modal = ensureLaunchImportPreviewModal();
  const body = document.getElementById('launchImportPreviewBody');
  body.innerHTML = `
    <div class="modal-head">
      <div>
        <div class="muted small">Excel загрузка</div>
        <h2>Предпросмотр новинок</h2>
        <div class="badge-stack">
          ${badge(`${fmt.int(created)} новых`, created ? 'ok' : '')}
          ${badge(`${fmt.int(updated)} обновлений`, updated ? 'info' : '')}
          ${changed ? badge(`${fmt.int(changed)} с изменениями`, 'warn') : badge('конфликтов нет', 'ok')}
        </div>
      </div>
      <button class="btn ghost" type="button" data-launch-import-cancel>Закрыть</button>
    </div>
    <div class="launch-import-preview-list">
      ${previewRows.slice(0, 18).map(({ row, mode, diff }) => `
        <div class="launch-import-preview-row ${mode}">
          <div>
            <strong>${escapeHtml(row.name || row.articleKey || 'Новинка')}</strong>
            <span>${escapeHtml(row.launchMonth || 'без месяца')} · ${escapeHtml(row.owner || 'без owner')}</span>
          </div>
          <div class="badge-stack">
            ${badge(mode === 'new' ? 'новая строка' : 'обновить', mode === 'new' ? 'ok' : 'info')}
            ${diff.length ? badge(diff.slice(0, 3).join(', '), 'warn') : badge('без явных изменений', 'ok')}
          </div>
        </div>
      `).join('')}
      ${previewRows.length > 18 ? `<div class="muted small">Еще ${fmt.int(previewRows.length - 18)} строк будут применены вместе с этим списком.</div>` : ''}
    </div>
    <div class="quick-actions launch-editor-actions">
      <button class="btn ghost" type="button" data-launch-import-cancel>Отмена</button>
      <button class="btn primary" type="button" data-launch-import-apply>Применить загрузку</button>
    </div>
  `;
  modal.classList.add('open');
  body.querySelectorAll('[data-launch-import-cancel]').forEach((button) => button.addEventListener('click', closeLaunchImportPreview));
  body.querySelector('[data-launch-import-apply]')?.addEventListener('click', () => {
    parsedRows.forEach((row) => upsertLaunchDraft(row));
    closeLaunchImportPreview();
    rerenderCurrentView();
    window.alert(`Форма новинок загружена: ${parsedRows.length} строк.`);
  });
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
      showLaunchImportPreview(parsedRows);
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
          <p class="small muted">Слой строится из файла Ксюши и календаря запуска. Здесь быстро видно, что именно мешает запуску: owner, SKU, материалы, календарь или отсутствие задач. Выгрузка в Excel берёт уже отфильтрованный список.</p>
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
          ${badge(`Календарь заполнен ${fmt.int(model.fullSummary.withGantt)}`, model.fullSummary.withGantt ? 'ok' : 'warn')}
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
          <option value="no-gantt" ${model.filters.readiness === 'no-gantt' ? 'selected' : ''}>Без календаря</option>
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
  root.querySelectorAll('[data-launch-download-form]').forEach((button) => {
    button.addEventListener('click', () => {
      downloadLaunchWorkbookTemplate(model.filteredItems.length ? model.filteredItems : model.items);
    });
  });
  root.querySelectorAll('[data-launch-import]').forEach((button) => {
    button.addEventListener('click', () => {
      root.querySelector('#launchWorkbookImport')?.click();
    });
  });
  root.querySelector('#launchWorkbookImport')?.addEventListener('change', (event) => {
    importLaunchWorkbookFile(event.target.files?.[0]);
    event.target.value = '';
  });
  root.querySelectorAll('[data-launch-add]').forEach((button) => {
    button.addEventListener('click', () => openLaunchEditor());
  });
  root.querySelectorAll('[data-launch-reset]').forEach((button) => {
    button.addEventListener('click', () => {
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
    nextAction: `Проверить owner, карточку, презентацию, запуск в реестре SKU, календарь запуска и ближайшие блокеры.${item.notes ? ` Контекст: ${item.notes}` : ''}`,
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

function getLaunchEditorItem(launchId = '', defaults = {}) {
  const seed = defaults && typeof defaults === 'object' ? defaults : {};
  if (!launchId) {
    return normalizeLaunchItem({
      id: uid('launch'),
      reportGroup: 'Продукт',
      launchMonth: state.dashboard?.dataFreshness?.launchPlanHorizon || 'Текущий фокус',
      status: 'Черновик',
      ...seed
    }, { skipTaskLookup: true });
  }
  return getLaunchItems({ skipTaskLookup: true }).find((item) => item.id === launchId)
    || normalizeLaunchItem({ id: launchId, reportGroup: 'Продукт', launchMonth: state.dashboard?.dataFreshness?.launchPlanHorizon || 'Текущий фокус', ...seed }, { skipTaskLookup: true });
}

function launchApplyStageSince(draft = {}, currentItem = {}) {
  const next = { ...draft };
  launchStageConfigs().forEach((config) => {
    const nextStatus = String(next[config.status] || '').trim();
    const previousStatus = String(currentItem?.[config.status] || '').trim();
    const submittedSince = String(next[config.since] || '').trim();
    const previousSince = String(currentItem?.[config.since] || '').trim();
    if (!nextStatus) {
      next[config.since] = '';
      return;
    }
    if (nextStatus !== previousStatus) {
      next[config.since] = todayIso();
      return;
    }
    next[config.since] = submittedSince || previousSince || todayIso();
  });
  return next;
}

function readLaunchEditorForm(form, currentItem, revenuePlan, launchPlan, ganttColumns) {
  const data = new FormData(form);
  const draft = {
    id: data.get('id') || currentItem.id,
    articleKey: data.get('articleKey'),
    article: data.get('article'),
    owner: data.get('owner'),
    reportGroup: data.get('reportGroup'),
    tag: data.get('tag'),
    skuBucket: data.get('skuBucket'),
    productType: data.get('productType'),
    productVersion: data.get('productVersion'),
    versionReason: data.get('versionReason'),
    launchMonth: data.get('launchMonth'),
    launchDate: data.get('launchDate'),
    status: data.get('status'),
    launchDecision: data.get('launchDecision'),
    launchDecisionReason: data.get('launchDecisionReason'),
    production: data.get('production'),
    supplierName: data.get('supplierName'),
    factoryName: data.get('factoryName'),
    supplierContact: data.get('supplierContact'),
    negotiationStatus: data.get('negotiationStatus'),
    negotiationOwner: data.get('negotiationOwner'),
    negotiationDue: data.get('negotiationDue'),
    negotiationSince: data.get('negotiationSince'),
    negotiationComment: data.get('negotiationComment'),
    sampleStatus: data.get('sampleStatus'),
    sampleOwner: data.get('sampleOwner'),
    sampleDue: data.get('sampleDue'),
    sampleSince: data.get('sampleSince'),
    sampleComment: data.get('sampleComment'),
    productionStatus: data.get('productionStatus'),
    productionOwner: data.get('productionOwner'),
    productionDue: data.get('productionDue'),
    productionSince: data.get('productionSince'),
    productionComment: data.get('productionComment'),
    packagingStatus: data.get('packagingStatus'),
    packagingOwner: data.get('packagingOwner'),
    packagingDue: data.get('packagingDue'),
    packagingSince: data.get('packagingSince'),
    packagingComment: data.get('packagingComment'),
    contentStatus: data.get('contentStatus'),
    contentOwner: data.get('contentOwner'),
    contentDue: data.get('contentDue'),
    contentSince: data.get('contentSince'),
    contentComment: data.get('contentComment'),
    launchReadinessStatus: data.get('launchReadinessStatus'),
    launchReadinessOwner: data.get('launchReadinessOwner'),
    launchReadinessDue: data.get('launchReadinessDue'),
    launchReadinessSince: data.get('launchReadinessSince'),
    launchReadinessComment: data.get('launchReadinessComment'),
    decisionLog: data.get('decisionLog'),
    productComment: data.get('productComment'),
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
  };
  return hydrateLaunchDraftWithSkuLink(launchApplyStageSince(draft, currentItem));
}

function renderLaunchNowPanel(item = {}) {
  const summary = launchNowSummary(item);
  const stage = summary.currentStage;
  const dueDays = summary.due ? diffFromTodayInDays(summary.due) : Number.POSITIVE_INFINITY;
  const dueTone = summary.due && Number.isFinite(dueDays) && dueDays < 0 ? 'danger' : summary.due && Number.isFinite(dueDays) && dueDays <= 3 ? 'warn' : 'info';
  const meta = [
    summary.owner ? `owner: ${summary.owner}` : 'owner не назначен',
    summary.due ? `срок: ${summary.due}` : 'срок не указан',
    stage ? stage.config.title : ''
  ].filter(Boolean).join(' · ');
  return `
    <div class="launch-editor-panel launch-now-panel">
      <div class="launch-now-main">
        <div>
          <span class="muted small">Следующее действие</span>
          <strong>${escapeHtml(summary.action)}</strong>
          <p>${escapeHtml(meta)}</p>
        </div>
        <div class="badge-stack">
          ${summary.readiness.ready ? badge('Можно запускать', 'ok') : badge(`Нельзя запускать: ${fmt.int(summary.readiness.missing.length)} пунктов`, 'warn')}
          ${summary.task ? badge('Есть задача запуска', 'ok') : badge('Задачу надо поставить', 'warn')}
        </div>
      </div>
      <div class="launch-now-grid">
        <div><span>Кто ведет</span><strong>${escapeHtml(summary.owner || 'не назначен')}</strong></div>
        <div><span>Срок</span><strong>${escapeHtml(summary.due || 'не указан')}</strong>${summary.due ? badge(Number.isFinite(dueDays) && dueDays < 0 ? `просрочено ${fmt.int(Math.abs(dueDays))} дн.` : Number.isFinite(dueDays) ? `через ${fmt.int(dueDays)} дн.` : 'срок есть', dueTone) : ''}</div>
        <div><span>Блокирует</span><strong>${escapeHtml(summary.blocker || 'явных блокеров нет')}</strong></div>
      </div>
    </div>
  `;
}

function renderLaunchReadinessPanel(item = {}) {
  const liveItem = normalizeLaunchItem(item);
  const readiness = launchReadinessState(liveItem);
  const doneCount = readiness.checks.length - readiness.missing.length;
  return `
    <div class="launch-editor-panel launch-readiness-panel">
      <div class="section-subhead">
        <div>
          <h3>Готовность к запуску</h3>
          <p class="small muted">${readiness.ready ? 'Все ключевые пункты закрыты.' : `Нужно закрыть: ${escapeHtml(readiness.missing.slice(0, 3).map((entry) => entry.label).join(', '))}${readiness.missing.length > 3 ? '…' : ''}`}</p>
        </div>
        ${badge(`${fmt.int(doneCount)} / ${fmt.int(readiness.checks.length)}`, readiness.ready ? 'ok' : 'warn')}
      </div>
      <div class="launch-readiness-bar"><span style="width:${Math.round(readiness.pct * 100)}%"></span></div>
      <div class="launch-readiness-grid">
        ${readiness.checks.map((entry) => `
          <div class="launch-readiness-item ${entry.ok ? 'ok' : 'warn'}">
            <strong>${entry.ok ? '✓' : '!'}</strong>
            <span>${escapeHtml(entry.label)}</span>
            <small>${escapeHtml(entry.detail || (entry.ok ? 'готово' : 'нужно заполнить'))}</small>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function openLaunchEditor(launchId = '', defaults = {}) {
  const currentItem = getLaunchEditorItem(launchId, defaults);
  const revenuePlan = normalizeLaunchPlanList(currentItem.monthlyRevenuePlan, launchPortalMonthPlanLabels(currentItem.launchMonth));
  const launchPlan = normalizeLaunchPlanList(currentItem.monthlyLaunchPlan, revenuePlan.map((entry) => entry.label));
  const ganttColumns = launchEditorMonthColumns(currentItem);
  const activeGantt = new Set((currentItem.ganttMonths || []).map((entry) => entry.monthKey));
  const owners = ownerOptions();
  const skuOptions = launchEditorSkuOptions(currentItem);
  const skuSuggestions = currentItem.skuSuggestions && currentItem.skuSuggestions.length ? currentItem.skuSuggestions : getLaunchSkuSuggestions(currentItem, 3);
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
        <h3>Календарь запуска</h3>
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

function productLeaderboardSkuForItem(item = {}) {
  if (typeof getSku !== 'function') return null;
  return getSku(item.articleKey || item.article || item.sku || item.vendorCode || '');
}

function productLeaderboardOwnerForItem(item = {}) {
  const sku = productLeaderboardSkuForItem(item);
  if (sku && typeof ownerName === 'function') {
    const skuOwner = typeof canonicalOwnerName === 'function'
      ? canonicalOwnerName(ownerName(sku) || '')
      : String(ownerName(sku) || '').trim();
    if (skuOwner) return skuOwner;
  }
  const rawOwner = item.ownerName || item.owner || '';
  return typeof canonicalOwnerName === 'function'
    ? canonicalOwnerName(rawOwner)
    : String(rawOwner || '').replace(/\s+/g, ' ').trim();
}

function productLeaderboardSum(values) {
  return (Array.isArray(values) ? values : []).reduce((total, value) => total + numberOrZero(value), 0);
}

function productLeaderboardSummaryFromItems(items) {
  const list = Array.isArray(items) ? items : [];
  const summary = {
    skuCount: list.length,
    ownerCount: new Set(list.map((item) => String(item.owner || '').trim()).filter(Boolean)).size,
    ownerAssignedCount: list.filter((item) => String(item.owner || '').trim()).length,
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
  const owner = productLeaderboardOwnerForItem(item);
  const normalized = {
    id: item.id || stableId('product-leaderboard', item.articleKey || item.article || item.name || ''),
    brand: item.brand || 'АЛТЕЯ',
    weekLabel: item.weekLabel || '',
    articleKey: item.articleKey || '',
    article: item.article || '',
    name: item.name || item.articleKey || item.article || 'SKU',
    owner,
    price: productLeaderboardNumberOrNull(item.price ?? item.currentPrice),
    priceWb: productLeaderboardNumberOrNull(item.priceWb ?? item.wbPrice ?? item.wb?.currentPrice ?? item.wb?.recPrice),
    priceOzon: productLeaderboardNumberOrNull(item.priceOzon ?? item.ozonPrice ?? item.ozon?.currentPrice ?? item.ozon?.recPrice),
    category: item.category || '',
    traffic: item.traffic || '',
    creator: item.creator || item.contentCreator || item.author || '',
    contentBatch: item.contentBatch || item.batchId || item.batch || item.contentParty || '',
    contentFormat: item.contentFormat || item.format || item.mediaFormat || '',
    publishedAt: item.publishedAt || item.publishDate || item.publicationDate || '',
    briefUrl: item.briefUrl || item.tzUrl || item.taskUrl || item.specUrl || '',
    contentId: item.contentId || item.content_id || '',
    contentHypothesis: item.contentHypothesis || item.hypothesis || '',
    productionStatus: item.productionStatus || item.contentStatus || '',
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

function productLeaderboardNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/\s+/g, '').replace(',', '.').replace(/[^\d.+-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function productLeaderboardFirstPositive(...values) {
  for (const value of values) {
    const parsed = productLeaderboardNumberOrNull(value);
    if (parsed !== null && parsed > 0) return parsed;
  }
  return null;
}

function productLeaderboardPriceMetrics(item = {}) {
  let sku = null;
  try {
    sku = item.articleKey && typeof getSku === 'function' ? getSku(item.articleKey) : null;
  } catch (_error) {
    sku = null;
  }
  const wb = productLeaderboardFirstPositive(item.priceWb, item.wbPrice, item.wb?.currentPrice, item.wb?.recPrice, sku?.wb?.currentPrice, sku?.wb?.recPrice);
  const ozon = productLeaderboardFirstPositive(item.priceOzon, item.ozonPrice, item.ozon?.currentPrice, item.ozon?.recPrice, sku?.ozon?.currentPrice, sku?.ozon?.recPrice);
  const main = productLeaderboardFirstPositive(item.price, item.currentPrice, wb, ozon);
  return { main, wb, ozon };
}

function productLeaderboardPriceHtml(item = {}) {
  const prices = productLeaderboardPriceMetrics(item);
  if (prices.wb === null && prices.ozon === null && prices.main === null) {
    return '<span class="muted small">—</span>';
  }
  const chips = [
    prices.wb !== null ? badge(`WB ${fmt.money(prices.wb)}`, 'info') : '',
    prices.ozon !== null ? badge(`Ozon ${fmt.money(prices.ozon)}`, 'info') : ''
  ].filter(Boolean).join('');
  return chips ? `<div class="badge-stack">${chips}</div>` : `<strong>${fmt.money(prices.main)}</strong>`;
}

function normalizeProductLeaderboardPayload(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items.map(normalizeProductLeaderboardItem) : [];
  const summary = productLeaderboardSummaryFromItems(items);
  const sourceSummary = payload.summary || {};
  const ownerList = items.map((item) => item.owner);
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
      ...sourceSummary,
      ...summary
    },
    owners: [...new Set(ownerList.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
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
  if (!state.productLeaderboardFilters._leaderGameSortMigrated) {
    if (!state.productLeaderboardFilters.sort || state.productLeaderboardFilters.sort === 'buys' || state.productLeaderboardFilters.sort === 'gameScore') {
      state.productLeaderboardFilters.sort = 'orderDeltaAbs';
    }
    state.productLeaderboardFilters._leaderGameSortMigrated = true;
  }
  state.productLeaderboardFilters.sort = state.productLeaderboardFilters.sort || 'orderDeltaAbs';
  state.productLeaderboardFilters.sortDir = state.productLeaderboardFilters.sortDir === 'asc' ? 'asc' : 'desc';
  state.productLeaderboardFilters.snapshot = state.productLeaderboardFilters.snapshot || 'latest';
  state.productLeaderboardFilters.lflCurrentSnapshot = state.productLeaderboardFilters.lflCurrentSnapshot || 'latest';
  state.productLeaderboardFilters.lflCompareSnapshot = state.productLeaderboardFilters.lflCompareSnapshot || '';
  state.productLeaderboardFilters.expandedPanel = state.productLeaderboardFilters.expandedPanel || 'metrics';
  state.productLeaderboardFilters.subview = state.productLeaderboardFilters.subview || 'overview';
  state.productLeaderboardFilters.weeklyMetric = state.productLeaderboardFilters.weeklyMetric || 'orders';
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

function productLeaderboardSnapshotKey(snapshot = {}, index = 0) {
  if (index === 0) return 'latest';
  return String(snapshot.generatedAt || snapshot.weekLabel || snapshot.sourceSheetName || `snapshot-${index}`);
}

function productLeaderboardSnapshotSelectOptions(snapshots = []) {
  const seenWeeks = new Set();
  return (Array.isArray(snapshots) ? snapshots : [])
    .map((snapshot, index) => {
      const weekLabel = snapshot.weekLabel || snapshot.sourceSheetName || (index === 0 ? 'Текущий срез' : `Срез ${index + 1}`);
      const weekKey = String(weekLabel || snapshot.generatedAt || index).trim().toLowerCase();
      const key = productLeaderboardSnapshotKey(snapshot, index);
      const generatedLabel = snapshot.generatedAt ? ` · ${fmt.date(snapshot.generatedAt)}` : '';
      return {
        snapshot,
        index,
        key,
        weekKey,
        label: `${weekLabel}${generatedLabel}`
      };
    })
    .filter((option) => {
      if (!option.weekKey) return true;
      if (seenWeeks.has(option.weekKey)) return false;
      seenWeeks.add(option.weekKey);
      return true;
    });
}

function currentProductLeaderboardPayload() {
  const filters = getProductLeaderboardFilters();
  const snapshots = productLeaderboardHistoryPayloads();
  if (filters.snapshot !== 'latest') {
    const matched = snapshots.find((item, index) => (
      productLeaderboardSnapshotKey(item, index) === filters.snapshot
      || item.generatedAt === filters.snapshot
    ));
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
  return {
    status: 'fresh',
    tone: 'info',
    ageDays: null,
    weekRange,
    badgeLabel: payload.weekLabel || payload.sourceSheetName || 'недельный срез',
    summaryLine: '',
    technicalLine: '',
    actionLine: ''
  };
}

function productLeaderboardExportRows(items, payload) {
  return items.map((item) => {
    const gameScore = productLeaderboardItemScore(item, payload);
    const prices = productLeaderboardPriceMetrics(item);
    return {
      week_label: payload.weekLabel || payload.sourceSheetName || '',
      generated_at: payload.generatedAt || '',
      article_key: item.articleKey || '',
      article: item.article || '',
      name: item.name || '',
      owner: item.owner || '',
      price: prices.main ?? '',
      price_wb: prices.wb ?? '',
      price_ozon: prices.ozon ?? '',
      category: item.category || '',
      traffic: item.traffic || '',
      creator: item.creator || '',
      content_batch: item.contentBatch || '',
      content_format: item.contentFormat || '',
      published_at: item.publishedAt || '',
      brief_url: item.briefUrl || '',
      content_id: item.contentId || '',
      content_hypothesis: item.contentHypothesis || '',
      production_status: item.productionStatus || '',
      signal: productLeaderboardSignalMeta(item.signal).label,
      game_score: gameScore.score,
      game_level: gameScore.label,
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
    };
  });
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
    ['price', 'Цена'],
    ['price_wb', 'Цена WB'],
    ['price_ozon', 'Цена Ozon'],
    ['category', 'Категория'],
    ['traffic', 'Трафик'],
    ['creator', 'Creator'],
    ['content_batch', 'Content batch'],
    ['content_format', 'Format'],
    ['published_at', 'Published at'],
    ['brief_url', 'TZ link'],
    ['content_id', 'Content ID'],
    ['content_hypothesis', 'Hypothesis'],
    ['production_status', 'Content status'],
    ['signal', 'Сигнал'],
    ['game_score', 'КЗ показатель'],
    ['game_level', 'КЗ статус'],
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

  const sortKey = filters.sort === 'orderDeltaAbs' ? 'orders' : (filters.sort || 'orders');
  const sortDir = filters.sortDir === 'asc' ? 'asc' : 'desc';
  const directionFactor = sortDir === 'asc' ? 1 : -1;
  const emptyMetric = sortDir === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  const getMetric = (item) => {
    if (sortKey === 'gameScore') return productLeaderboardItemScore(item, payload).score;
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

function productLeaderboardMetricTarget(payload = {}, key = '', fallback = 0) {
  const value = productLeaderboardRate(payload?.baselines?.[key]);
  return value !== null && value > 0 ? value : fallback;
}

function productLeaderboardMetricCompletion(value, target, options = {}) {
  const actual = productLeaderboardRate(value);
  const planned = productLeaderboardRate(target);
  if (actual === null || planned === null || planned <= 0) return null;
  const raw = options.lowerIsBetter ? planned / Math.max(actual, planned * 0.2) : actual / planned;
  return Math.max(0, Math.min(1.35, raw));
}

function productLeaderboardScoreTone(score) {
  if (score >= 85) return 'ok';
  if (score >= 65) return 'info';
  if (score >= 45) return 'warn';
  return 'danger';
}

function productLeaderboardScoreLabel(score) {
  if (score >= 90) return 'КЗ чемпион';
  if (score >= 75) return 'сильная неделя';
  if (score >= 55) return 'нужен фокус';
  return 'разобрать срочно';
}

function productLeaderboardScoreLevel(score) {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 55) return 3;
  if (score >= 35) return 2;
  return 1;
}

function productLeaderboardHealthBarHtml(config = {}) {
  if (typeof skuPlanFactHealthBarHtml === 'function') return skuPlanFactHealthBarHtml(config);
  const ratio = Number(config.valueRatio);
  const width = Number.isFinite(ratio) ? Math.min(100, Math.max(0, ratio * 100)) : 0;
  return `
    <div class="sku-health ${escapeHtml(config.tone || '')}">
      <div class="sku-health__head"><span>${escapeHtml(config.label || '')}</span><strong>${config.valueHtml || escapeHtml(config.valueText || '')}</strong></div>
      <span class="sku-health__bar"><i style="width:${width.toFixed(1)}%"></i><em>${escapeHtml(config.barText || config.valueText || '')}</em></span>
      ${(config.metaHtml || config.subText) ? `<div class="sku-health__meta">${config.metaHtml || `<em>${escapeHtml(config.subText || '')}</em>`}</div>` : ''}
    </div>
  `;
}

function productLeaderboardItemScore(item = {}, payload = {}) {
  const ctrTarget = productLeaderboardMetricTarget(payload, 'ctrPct', 0.01);
  const cartTarget = productLeaderboardMetricTarget(payload, 'cartRatePct', 0.3);
  const buyoutTarget = productLeaderboardMetricTarget(payload, 'buyoutPct', 0.85);
  const romiTarget = Math.max(1, productLeaderboardMetricTarget(payload, 'romiPct', 1));
  const drrTarget = Math.min(0.35, productLeaderboardMetricTarget(payload, 'drrPct', 0.35) || 0.35);
  const alertPenalty = (item.diagnostics?.alerts || []).reduce((sum, alert) => {
    const rank = productLeaderboardAlertRank(alert.severity);
    return sum + (rank >= 4 ? 16 : rank >= 3 ? 9 : rank >= 2 ? 4 : 1);
  }, 0);
  const parts = [
    productLeaderboardMetricCompletion(item.ctrPct, ctrTarget),
    productLeaderboardMetricCompletion(item.cartRatePct, cartTarget),
    productLeaderboardMetricCompletion(item.buyoutPct, buyoutTarget),
    productLeaderboardMetricCompletion(item.romiPct, romiTarget),
    productLeaderboardMetricCompletion(item.drrPct, drrTarget, { lowerIsBetter: true })
  ].filter((value) => value !== null);
  const raw = parts.length ? parts.reduce((sum, value) => sum + Math.min(1, value), 0) / parts.length * 100 : 0;
  const score = Math.max(0, Math.min(100, Math.round(raw - alertPenalty)));
  return {
    score,
    tone: productLeaderboardScoreTone(score),
    level: productLeaderboardScoreLevel(score),
    label: productLeaderboardScoreLabel(score)
  };
}

function productLeaderboardGameScore(payload = {}, items = []) {
  const summary = productLeaderboardSummaryFromItems(items);
  const ownerCoverage = summary.skuCount > 0 ? summary.ownerAssignedCount / summary.skuCount : 0;
  const modules = [
    productLeaderboardMetricCompletion(summary.ctrPct, productLeaderboardMetricTarget(payload, 'ctrPct', 0.01)),
    productLeaderboardMetricCompletion(summary.cartRatePct, productLeaderboardMetricTarget(payload, 'cartRatePct', 0.3)),
    productLeaderboardMetricCompletion(summary.buyoutPct, productLeaderboardMetricTarget(payload, 'buyoutPct', 0.85)),
    productLeaderboardMetricCompletion(summary.romiPct, Math.max(1, productLeaderboardMetricTarget(payload, 'romiPct', 1))),
    productLeaderboardMetricCompletion(summary.drrPct, Math.min(0.35, productLeaderboardMetricTarget(payload, 'drrPct', 0.35) || 0.35), { lowerIsBetter: true }),
    ownerCoverage
  ].filter((value) => value !== null);
  const penalty = items.reduce((sum, item) => sum + (item.diagnostics?.alerts || []).reduce((itemSum, alert) => {
    const rank = productLeaderboardAlertRank(alert.severity);
    return itemSum + (rank >= 4 ? 8 : rank >= 3 ? 3 : rank >= 2 ? 1 : 0);
  }, 0), 0);
  const score = Math.max(0, Math.min(100, Math.round((modules.reduce((sum, value) => sum + Math.min(1, value), 0) / Math.max(1, modules.length)) * 100 - penalty)));
  return {
    score,
    tone: productLeaderboardScoreTone(score),
    label: productLeaderboardScoreLabel(score),
    level: productLeaderboardScoreLevel(score),
    ownerCoverage,
    summary
  };
}

function productLeaderboardModuleCardHtml(config = {}) {
  const completion = config.completion;
  const level = typeof skuPlanFactCompletionLevel === 'function'
    ? skuPlanFactCompletionLevel(completion)
    : productLeaderboardScoreLevel((Number(completion) || 0) * 100);
  const style = typeof skuPlanFactCardStyle === 'function' ? skuPlanFactCardStyle('wb', completion) : '';
  return `
    <div class="sku-plan-platform-card level-${level}" style="${style};cursor:default">
      <span class="sku-plan-platform-card__top">
        <strong>${escapeHtml(config.title || '')}</strong>
        <em>${escapeHtml(config.kicker || '')}</em>
      </span>
      <span class="sku-plan-platform-card__value">${escapeHtml(config.value || '')}</span>
      <span class="sku-plan-platform-card__meta">${escapeHtml(config.meta || '')}</span>
      <span class="sku-plan-platform-card__bar"><i></i></span>
      <span class="sku-plan-platform-card__foot">
        <b class="${escapeHtml(config.deltaClass || '')}">${escapeHtml(config.footer || '')}</b>
        <span><em>${escapeHtml(config.hint || '')}</em></span>
      </span>
    </div>
  `;
}

function productLeaderboardGameHeroHtml(payload = {}, filteredItems = [], freshness = {}) {
  const game = productLeaderboardGameScore(payload, filteredItems);
  const progress = Math.min(100, Math.max(0, game.score));
  const hue = typeof skuPlanFactPlatformHue === 'function' ? skuPlanFactPlatformHue('wb') : 270;
  const brightness = Math.min(1, Math.max(0.15, game.score / 100));
  return `
    <div class="card sku-plan-fact-card salary-plan-kpi-card product-leaderboard-game-card level-${game.level}" style="margin-top:14px;--xp-hue:${hue};--xp-progress:${progress.toFixed(1)}%;--xp-forecast:${progress.toFixed(1)}%;--xp-bright:${brightness.toFixed(2)}">
      <div class="sku-salary-xp-head">
        <div>
          <h3>КЗ состояние недели</h3>
          <p class="small muted">${escapeHtml(payload.weekLabel || payload.sourceSheetName || 'текущий срез')}</p>
        </div>
        <div class="badge-stack">
          ${badge(game.label, game.tone)}
        </div>
      </div>
      <div class="sku-salary-xp-main">
        <div class="sku-salary-xp-score">
          <span>индекс</span>
          <strong>${fmt.int(game.score)}</strong>
          <em>${escapeHtml(game.label)}</em>
        </div>
        <div class="sku-salary-xp-track" aria-label="КЗ состояние недели" title="${escapeHtml(`${fmt.int(game.score)} / 100`)}"><i></i></div>
        <div class="sku-salary-xp-delta ${game.score >= 75 ? 'ok' : game.score >= 55 ? 'warn' : 'danger'}">
          <span>фокус</span>
          <strong>${game.score >= 75 ? 'масштабировать' : game.score >= 55 ? 'дожать модули' : 'разобрать риски'}</strong>
        </div>
      </div>
      <div class="sku-salary-xp-stats">
        <span><em>SKU</em><b>${fmt.int(game.summary.skuCount)}</b></span>
        <span><em>заказы</em><b>${fmt.int(game.summary.orders)}</b></span>
        <span><em>выкупы</em><b>${fmt.int(game.summary.buys)}</b></span>
        <span><em>owner</em><b>${fmt.pct(game.ownerCoverage)}</b></span>
      </div>
    </div>
  `;
}

function productLeaderboardModuleBoardHtml(payload = {}, summary = {}, ownerCoverage = 0) {
  const ctrTarget = productLeaderboardMetricTarget(payload, 'ctrPct', 0.01);
  const cartTarget = productLeaderboardMetricTarget(payload, 'cartRatePct', 0.3);
  const buyoutTarget = productLeaderboardMetricTarget(payload, 'buyoutPct', 0.85);
  const romiTarget = Math.max(1, productLeaderboardMetricTarget(payload, 'romiPct', 1));
  const drrTarget = Math.min(0.35, productLeaderboardMetricTarget(payload, 'drrPct', 0.35) || 0.35);
  const cards = [
    {
      title: 'Трафик',
      kicker: `${fmt.int(summary.reach)} охват`,
      value: fmt.pct(summary.ctrPct),
      meta: `${fmt.int(summary.clicks)} кликов`,
      completion: productLeaderboardMetricCompletion(summary.ctrPct, ctrTarget),
      footer: `цель ${fmt.pct(ctrTarget)}`,
      hint: 'CTR'
    },
    {
      title: 'Корзина',
      kicker: `${fmt.int(summary.carts)} корзин`,
      value: fmt.pct(summary.cartRatePct),
      meta: `${fmt.int(summary.carts)} / ${fmt.int(summary.clicks)}`,
      completion: productLeaderboardMetricCompletion(summary.cartRatePct, cartTarget),
      footer: `цель ${fmt.pct(cartTarget)}`,
      hint: 'клики в корзину'
    },
    {
      title: 'Выкуп',
      kicker: `${fmt.int(summary.buys)} выкупов`,
      value: fmt.pct(summary.buyoutPct),
      meta: `${fmt.int(summary.buys)} / ${fmt.int(summary.orders)}`,
      completion: productLeaderboardMetricCompletion(summary.buyoutPct, buyoutTarget),
      footer: `цель ${fmt.pct(buyoutTarget)}`,
      hint: 'выкуп к заказам'
    },
    {
      title: 'Экономика',
      kicker: `ДРР ${fmt.pct(summary.drrPct)}`,
      value: fmt.pct(summary.romiPct),
      meta: `${fmt.money(summary.income)} доход`,
      completion: productLeaderboardMetricCompletion(summary.romiPct, romiTarget),
      footer: `ROMI цель ${fmt.pct(romiTarget)}`,
      hint: `ДРР цель ${fmt.pct(drrTarget)}`
    },
    {
      title: 'Ответственные',
      kicker: `${fmt.int(summary.ownerCount)} owner`,
      value: fmt.pct(ownerCoverage),
      meta: `${fmt.int(summary.ownerAssignedCount)} / ${fmt.int(summary.skuCount)} SKU`,
      completion: ownerCoverage,
      footer: ownerCoverage >= 0.95 ? 'контур закрыт' : 'назначить owner',
      hint: 'покрытие'
    }
  ];
  return `<div class="sku-plan-platform-board product-leaderboard-module-board" style="margin-top:14px">${cards.map(productLeaderboardModuleCardHtml).join('')}</div>`;
}

function productLeaderboardLatestDigitalContour() {
  const payload = state.iuDrrSummary && typeof state.iuDrrSummary === 'object' ? state.iuDrrSummary : {};
  const months = Array.isArray(payload.months) ? payload.months : [];
  const ranked = months
    .slice()
    .sort((left, right) => String(right.monthKey || '').localeCompare(String(left.monthKey || '')));
  const month = ranked.find((entry) => (
    numberOrZero(entry.iuRevenueFactToDate)
    || numberOrZero(entry.revenueWb)
    || numberOrZero(entry.revenueOzon)
  )) || ranked[0] || {};
  const revenueWb = numberOrZero(month.revenueWb || month.iuRevenueWbFactToDate);
  const revenueOzon = numberOrZero(month.revenueOzon || month.iuRevenueOzonFactToDate);
  const revenue = numberOrZero(month.iuRevenueFactToDate) || revenueWb + revenueOzon;
  const spendWb = numberOrZero(month.spendFact || month.iuAdsFactWbToDate);
  const spendOzon = numberOrZero(month.spendFactOzon || month.iuAdsFactOzonToDate);
  const spend = numberOrZero(month.spendFactIu || month.iuAdsFactTotalToDate) || spendWb + spendOzon;
  const externalAds = numberOrZero(month.externalAds || month.channels?.externalAds?.spend);
  const totalSpendWithExternal = spend + externalAds;
  return {
    label: month.label || month.monthKey || 'digital',
    monthKey: month.monthKey || '',
    revenue,
    revenueWb,
    revenueOzon,
    spend,
    spendWb,
    spendOzon,
    externalAds,
    externalRevenueShare: revenue > 0 ? externalAds / revenue : null,
    externalSpendShare: totalSpendWithExternal > 0 ? externalAds / totalSpendWithExternal : null,
    drr: revenue > 0 ? spend / revenue : null
  };
}

function productLeaderboardPreviousComparableSnapshot(payload = {}) {
  const currentWeek = String(payload.weekLabel || '').trim();
  const candidates = productLeaderboardHistoryPayloads()
    .slice(1)
    .map((snapshot) => {
      const summary = productLeaderboardSummaryFromItems(snapshot.items || []);
      return { snapshot, summary };
    })
    .filter((entry) => entry.summary.revenue > 0)
    .filter((entry) => String(entry.snapshot.weekLabel || '').trim() !== currentWeek)
    .sort((left, right) => {
      const rightDate = Date.parse(right.snapshot.generatedAt || '') || 0;
      const leftDate = Date.parse(left.snapshot.generatedAt || '') || 0;
      return rightDate - leftDate;
    });
  return candidates[0] || null;
}

function productLeaderboardSignedMoney(value) {
  const numeric = numberOrZero(value);
  const sign = numeric > 0 ? '+' : numeric < 0 ? '-' : '';
  return `${sign}${fmt.money(Math.abs(numeric))}`;
}

function productLeaderboardSignedPct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const numeric = Number(value);
  const sign = numeric > 0 ? '+' : numeric < 0 ? '-' : '';
  return `${sign}${fmt.pct(Math.abs(numeric))}`;
}

function productLeaderboardSignedPp(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const numeric = Number(value) * 100;
  const sign = numeric > 0 ? '+' : numeric < 0 ? '-' : '';
  return `${sign}${Math.abs(numeric).toFixed(1)} п.п.`;
}

function productLeaderboardGrowthDriver(label, current, previous, options = {}) {
  const curr = numberOrZero(current);
  const prev = numberOrZero(previous);
  const delta = curr - prev;
  const rate = prev > 0 ? delta / prev : null;
  const tone = options.lowerIsBetter
    ? (delta <= 0 ? 'ok' : 'warn')
    : (delta >= 0 ? 'ok' : 'warn');
  const value = options.format === 'money'
    ? productLeaderboardSignedMoney(delta)
    : options.format === 'pp'
      ? productLeaderboardSignedPp(delta)
      : productLeaderboardSignedPct(rate);
  const detail = options.detail || (options.format === 'money'
    ? `${fmt.money(curr)} сейчас`
    : `${fmt.int(curr)} сейчас`);
  return { label, value, detail, tone };
}

function productLeaderboardCommonOrderContour(summary = {}, items = [], filters = {}) {
  const substitutionModel = productLeaderboardSubstitutionRowsForItems(items, filters);
  const substitutionSummary = productLeaderboardSubstitutionSummary(substitutionModel.rows);
  const totalOrders = numberOrZero(substitutionSummary.orders);
  const kzOrdersRaw = numberOrZero(summary.orders);
  const kzOrders = totalOrders > 0 ? Math.min(kzOrdersRaw, totalOrders) : kzOrdersRaw;
  const organicOrders = Math.max(0, totalOrders - kzOrders);
  const denominator = totalOrders > 0 ? totalOrders : kzOrders + organicOrders;
  return {
    totalOrders: denominator,
    kzOrders,
    organicOrders,
    kzShare: denominator > 0 ? kzOrders / denominator : null,
    organicShare: denominator > 0 ? organicOrders / denominator : null,
    substitutionSummary,
    sourceLabel: substitutionModel.payload.asOfDate || substitutionModel.payload.source?.sourceGeneratedAt || substitutionModel.payload.generatedAt || '',
    isFiltered: substitutionModel.isFiltered
  };
}

function productLeaderboardTrafficBucket(value = '') {
  const traffic = String(value || '').trim().toLowerCase();
  if (traffic.includes('\u043a\u0437') || traffic.includes('kz')) return 'kz';
  if (traffic) return 'digital';
  return 'organic';
}

function productLeaderboardItemSubstitutionKeys(item = {}) {
  const keys = new Set();
  [
    item.articleKey,
    item.article,
    item.sellerArticle,
    item.vendorCode,
    item.sku,
    item.nmId,
    item.productId,
    item.id
  ].forEach((value) => {
    const key = productLeaderboardSubstitutionKey(value);
    if (key) keys.add(key);
  });
  return [...keys];
}

function productLeaderboardWbSubstitutionArticleMap(payload = wbSubstitutionTrafficPayload()) {
  const map = new Map();
  const articles = Array.isArray(payload?.articles) ? payload.articles : [];
  const setKey = (value, row) => {
    const key = productLeaderboardSubstitutionKey(value);
    if (key && !map.has(key)) map.set(key, row);
  };
  articles.forEach((row = {}) => {
    [
      row.articleKey,
      row.article,
      row.sellerArticle,
      row.vendorCode,
      row.sku,
      row.nmId,
      row.productId,
      row.id
    ].forEach((value) => setKey(value, row));
  });
  return map;
}

function productLeaderboardWbSubstitutionRowHasTraffic(row = null) {
  if (!row || typeof row !== 'object') return false;
  return Boolean(
    numberOrZero(row.orders)
    || numberOrZero(row.views)
    || numberOrZero(row.carts)
    || numberOrZero(row.substitutionCount)
    || numberOrZero(row.rowCount)
  );
}

function productLeaderboardWbSubstitutionRowForItem(item = {}, articleMap = null) {
  const map = articleMap || productLeaderboardWbSubstitutionArticleMap();
  for (const key of productLeaderboardItemSubstitutionKeys(item)) {
    const row = map.get(key);
    if (row) return row;
  }
  return null;
}

function productLeaderboardTrafficBucketForItem(item = {}, articleMap = null) {
  const wbRow = productLeaderboardWbSubstitutionRowForItem(item, articleMap);
  if (productLeaderboardWbSubstitutionRowHasTraffic(wbRow)) return 'kz';
  return productLeaderboardTrafficBucket(item.traffic);
}

function productLeaderboardWbSubstitutionPayloadForRange(range = {}) {
  const fromIso = String(range.fromIso || range.startKey || '').slice(0, 10);
  const toIso = String(range.toIso || range.endKey || fromIso || '').slice(0, 10);
  if (!fromIso && !toIso) return null;
  return wbSubstitutionTrafficHistoryPayloads().find((payload = {}) => {
    const stamp = String(payload.asOfDate || payload.source?.sourceGeneratedAt || payload.generatedAt || '').slice(0, 10);
    if (!stamp) return false;
    if (fromIso && stamp < fromIso) return false;
    if (toIso && stamp > toIso) return false;
    return true;
  }) || null;
}

function productLeaderboardWbSubstitutionStatsForItems(items = [], payload = wbSubstitutionTrafficPayload()) {
  const articleMap = productLeaderboardWbSubstitutionArticleMap(payload);
  const seen = new Set();
  const rows = [];
  (Array.isArray(items) ? items : []).forEach((item = {}) => {
    const row = productLeaderboardWbSubstitutionRowForItem(item, articleMap);
    if (!productLeaderboardWbSubstitutionRowHasTraffic(row)) return;
    const rowKey = productLeaderboardSubstitutionArticleKey(row)
      || productLeaderboardItemSubstitutionKeys(item)[0]
      || `row-${rows.length}`;
    if (seen.has(rowKey)) return;
    seen.add(rowKey);
    rows.push(row);
  });
  const summary = productLeaderboardSubstitutionSummary(rows);
  const sourceLabel = payload.asOfDate || payload.source?.sourceGeneratedAt || payload.generatedAt || '';
  return {
    ...summary,
    rows,
    hasData: rows.length > 0,
    source: 'wb-substitution-traffic',
    sourceLabel,
    labels: rows.length ? [`WB подменники ${fmt.int(summary.articles)} SKU`] : []
  };
}

function productLeaderboardWeeklyShareRows() {
  const byWeek = new Map();
  productLeaderboardHistoryPayloads().forEach((snapshot, index) => {
    const weekLabel = String(snapshot.weekLabel || snapshot.sourceSheetName || (snapshot.generatedAt || '').slice(0, 10) || '').trim();
    if (!weekLabel) return;
    const previous = byWeek.get(weekLabel);
    const currentStamp = parseFreshStamp(snapshot.generatedAt || snapshot.sourceWeekTo || weekLabel);
    const previousStamp = previous ? parseFreshStamp(previous.snapshot.generatedAt || previous.snapshot.sourceWeekTo || previous.weekLabel) : 0;
    if (!previous || currentStamp >= previousStamp) {
      byWeek.set(weekLabel, {
        weekLabel,
        snapshot,
        snapshotKey: productLeaderboardSnapshotKey(snapshot, index)
      });
    }
  });

  const rows = [...byWeek.values()]
    .map(({ weekLabel, snapshot, snapshotKey }) => {
      const items = getFilteredProductLeaderboardItems(snapshot);
      const summary = productLeaderboardSummaryFromItems(items);
      const orders = { kz: 0, digital: 0, organic: 0 };
      const revenue = { kz: 0, digital: 0, organic: 0 };
      const range = productLeaderboardWeekRange(weekLabel || snapshot.weekLabel || snapshot.sourceSheetName || '');
      const wbPayload = productLeaderboardWbSubstitutionPayloadForRange(range)
        || (snapshotKey === 'latest' ? wbSubstitutionTrafficPayload() : null);
      const wbArticleMap = wbPayload ? productLeaderboardWbSubstitutionArticleMap(wbPayload) : null;
      items.forEach((item) => {
        const bucket = wbArticleMap
          ? productLeaderboardTrafficBucketForItem(item, wbArticleMap)
          : productLeaderboardTrafficBucket(item.traffic);
        const wbRow = bucket === 'kz' && wbArticleMap
          ? productLeaderboardWbSubstitutionRowForItem(item, wbArticleMap)
          : null;
        const orderValue = productLeaderboardWbSubstitutionRowHasTraffic(wbRow)
          ? numberOrZero(wbRow.orders)
          : numberOrZero(item.orders);
        orders[bucket] += orderValue;
        revenue[bucket] += numberOrZero(item.revenue);
      });
      const totalOrders = orders.kz + orders.digital + orders.organic || numberOrZero(summary.orders);
      const totalRevenue = revenue.kz + revenue.digital + revenue.organic || numberOrZero(summary.revenue);
      const sortStamp = parseFreshStamp(range?.fromIso || range?.startKey || snapshot.sourceWeekFrom || snapshot.generatedAt || weekLabel);
      return {
        weekLabel,
        snapshotKey,
        range,
        generatedAt: snapshot.generatedAt || '',
        items,
        summary,
        skuCount: summary.skuCount,
        orders,
        revenue,
        totalOrders,
        totalRevenue,
        kzShare: totalOrders > 0 ? orders.kz / totalOrders : null,
        digitalShare: totalOrders > 0 ? orders.digital / totalOrders : null,
        organicShare: totalOrders > 0 ? orders.organic / totalOrders : null,
        wbSubstitutionSourceLabel: wbPayload ? (wbPayload.asOfDate || wbPayload.source?.sourceGeneratedAt || wbPayload.generatedAt || '') : '',
        sortStamp
      };
    })
    .filter((row) => row.totalOrders > 0)
    .sort((left, right) => (
      numberOrZero(left.sortStamp) - numberOrZero(right.sortStamp)
      || String(left.weekLabel || '').localeCompare(String(right.weekLabel || ''), 'ru')
    ));

  rows.forEach((row, index) => {
    const previous = rows[index - 1] || null;
    row.previous = previous;
    row.kzShareDelta = previous && row.kzShare != null && previous.kzShare != null ? row.kzShare - previous.kzShare : null;
    row.digitalShareDelta = previous && row.digitalShare != null && previous.digitalShare != null ? row.digitalShare - previous.digitalShare : null;
    row.organicShareDelta = previous && row.organicShare != null && previous.organicShare != null ? row.organicShare - previous.organicShare : null;
    row.ordersDelta = previous ? row.totalOrders - previous.totalOrders : null;
  });
  return rows;
}

function productLeaderboardWeeklyTrendTone(delta) {
  const numeric = Number(delta);
  if (!Number.isFinite(numeric) || numeric === 0) return 'info';
  return numeric > 0 ? 'ok' : 'danger';
}

function productLeaderboardWeeklyTrendDelta(delta) {
  if (delta === null || delta === undefined || Number.isNaN(Number(delta))) return '—';
  return productLeaderboardSignedPp(delta);
}

function productLeaderboardWeeklyRowSnapshotMatch(row = {}, selectedKey = '') {
  const cleanKey = String(selectedKey || '').trim();
  if (!cleanKey || cleanKey === 'latest') return row.snapshotKey === 'latest';
  return row.snapshotKey === cleanKey
    || row.generatedAt === cleanKey
    || row.weekLabel === cleanKey
    || String(row.range?.fromIso || row.range?.startKey || '') === cleanKey
    || String(row.range?.toIso || row.range?.endKey || '') === cleanKey;
}

function productLeaderboardWeeklyTrendCardHtml(config = {}) {
  const deltaTone = productLeaderboardWeeklyTrendTone(config.delta);
  const deltaHtml = config.delta === null
    ? ''
    : `<b class="${deltaTone === 'ok' ? 'ok-text' : deltaTone === 'danger' ? 'danger-text' : ''}">${escapeHtml(productLeaderboardWeeklyTrendDelta(config.delta))}</b>`;
  const detailHtml = config.detail ? `<small>${escapeHtml(config.detail)}</small>` : '';
  const progress = Number(config.progress);
  const progressStyle = Number.isFinite(progress) ? `--bi-card-progress:${Math.max(0, Math.min(100, progress * 100)).toFixed(1)}%;` : '';
  const hueStyle = config.hue == null ? '' : `--bi-card-hue:${Number(config.hue) || 42};`;
  return `
    <div class="product-leaderboard-weekly-bi-card ${escapeHtml(config.className || '')}" style="${progressStyle}${hueStyle}">
      <span>${escapeHtml(config.label || '')}</span>
      <strong>${escapeHtml(config.value || '')}</strong>
      <em>${escapeHtml(config.meta || '')}</em>
      ${deltaHtml}
      ${detailHtml}
    </div>
  `;
}

function productLeaderboardLatestIuDailyRow(preferredDate = '') {
  const rows = Array.isArray(state.iuDrrSummary?.daily) ? state.iuDrrSummary.daily : [];
  if (!rows.length) return {};
  const cleanDate = String(preferredDate || '').slice(0, 10);
  if (cleanDate) {
    const exact = rows.find((row) => String(row?.date || '').slice(0, 10) === cleanDate);
    if (exact) return exact;
  }
  return rows[rows.length - 1] || {};
}

function productLeaderboardAdsPlatform(key = '') {
  const cleanKey = String(key || '').trim().toLowerCase();
  const platforms = Array.isArray(state.adsSummary?.platforms) ? state.adsSummary.platforms : [];
  return platforms.find((platform) => (
    String(platform?.key || platform?.platformKey || '').trim().toLowerCase() === cleanKey
  )) || null;
}

function productLeaderboardAdsRowIsAggregate(row = {}) {
  const key = String(row.articleKey || row.article || row.sellerArticle || row.vendorCode || row.name || '').trim().toLowerCase();
  return !key || key.includes('-total') || key.includes(' total') || key === 'all' || key === 'wb' || key === 'ozon';
}

function productLeaderboardItemKeySet(items = []) {
  const keys = new Set();
  (Array.isArray(items) ? items : []).forEach((item = {}) => {
    [
      item.articleKey,
      item.article,
      item.sku,
      item.vendorCode,
      item.nmId,
      item.productId
    ].forEach((value) => {
      const key = productLeaderboardSubstitutionKey(value);
      if (key) keys.add(key);
    });
  });
  return keys;
}

function productLeaderboardAdsRowMatchesItems(row = {}, itemKeys = new Set()) {
  if (!itemKeys || itemKeys.size === 0 || productLeaderboardAdsRowIsAggregate(row)) return false;
  return [
    row.articleKey,
    row.article,
    row.sellerArticle,
    row.vendorCode,
    row.nmId,
    row.productId
  ].some((value) => itemKeys.has(productLeaderboardSubstitutionKey(value)));
}

function productLeaderboardItemTrafficAdsModel(items = []) {
  const labels = new Set();
  const model = {
    adsOrders: 0,
    wbAdsOrders: 0,
    ozonAdsOrders: 0,
    labels: []
  };
  (Array.isArray(items) ? items : []).forEach((item = {}) => {
    if (productLeaderboardTrafficBucket(item.traffic) !== 'digital') return;
    const orders = numberOrZero(item.orders);
    const traffic = String(item.traffic || '').trim();
    if (traffic) labels.add(traffic);
    model.adsOrders += orders;
    const cleanTraffic = traffic.toLowerCase();
    if (cleanTraffic.includes('ozon') || cleanTraffic.includes('озон')) model.ozonAdsOrders += orders;
    else if (cleanTraffic.includes('wb') || cleanTraffic.includes('wildberries') || cleanTraffic.includes('вб')) model.wbAdsOrders += orders;
  });
  model.labels = [...labels];
  return model;
}

function productLeaderboardMarketplaceAdsShareModel(weekRow = {}, filters = {}) {
  const items = Array.isArray(weekRow.items) ? weekRow.items : [];
  const itemKeys = productLeaderboardItemKeySet(items);
  const range = weekRow.range || {};
  const fromIso = String(range.fromIso || range.startKey || '').slice(0, 10);
  const toIso = String(range.toIso || range.endKey || fromIso || '').slice(0, 10);
  const adsRows = Array.isArray(state.adsSummary?.itemSeries) ? state.adsSummary.itemSeries : [];
  const weekAdsRows = adsRows.filter((row) => {
    const date = String(row?.date || row?.dateKey || '').slice(0, 10);
    if (!date) return false;
    if (fromIso && date < fromIso) return false;
    if (toIso && date > toIso) return false;
    return true;
  });
  const matchedRows = weekAdsRows.filter((row) => productLeaderboardAdsRowMatchesItems(row, itemKeys));
  const matched = matchedRows.reduce((model, row = {}) => {
    const orders = numberOrZero(row.orders);
    model.adsOrders += orders;
    const platform = String(row.platformKey || row.key || '').trim().toLowerCase();
    if (platform === 'wb') model.wbAdsOrders += orders;
    if (platform === 'ozon') model.ozonAdsOrders += orders;
    return model;
  }, { adsOrders: 0, wbAdsOrders: 0, ozonAdsOrders: 0 });
  const traffic = productLeaderboardItemTrafficAdsModel(items);
  const useMatchedRows = matchedRows.length > 0;
  const adsOrders = useMatchedRows ? matched.adsOrders : traffic.adsOrders;
  const wbAdsOrders = useMatchedRows ? matched.wbAdsOrders : traffic.wbAdsOrders;
  const ozonAdsOrders = useMatchedRows ? matched.ozonAdsOrders : traffic.ozonAdsOrders;
  const totalOrders = numberOrZero(weekRow.totalOrders) || numberOrZero(productLeaderboardSummaryFromItems(items).orders);
  const date = fromIso && toIso
    ? `${productLeaderboardDateOnlyLabel(fromIso)} - ${productLeaderboardDateOnlyLabel(toIso)}`
    : (weekRow.weekLabel || '');
  const filterApplied = productLeaderboardHasActiveFilters(filters);
  const trafficLabel = traffic.labels.length ? `traffic: ${traffic.labels.join(', ')}` : 'traffic-метка не найдена';
  return {
    date,
    adsOrders,
    totalOrders,
    wbAdsOrders,
    ozonAdsOrders,
    wbOrders: 0,
    ozonOrders: 0,
    share: totalOrders > 0 ? adsOrders / totalOrders : null,
    source: useMatchedRows ? 'ads-series-sku' : 'leaderboard-traffic',
    detail: useMatchedRows
      ? `SKU-реклама ${fmt.int(matchedRows.length)} строк`
      : `${filterApplied ? 'по текущим фильтрам' : 'по недельному срезу'} · ${trafficLabel}`
  };
}

function productLeaderboardDateOnlyLabel(value = '') {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}.${match[2]}.${match[1]}`;
  return text ? fmt.date(text) : '';
}

function productLeaderboardBucketLabel(bucket = '') {
  if (bucket === 'kz') return 'WB подменники';
  if (bucket === 'digital') return 'digital';
  return 'без метки';
}

function productLeaderboardAggregateItemsByKey(items = []) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item = {}) => {
    const key = productLeaderboardItemCompareKey(item);
    if (!key) return;
    const entry = map.get(key) || {
      key,
      item,
      reach: 0,
      orders: 0,
      revenue: 0,
      income: 0,
      clicks: 0,
      carts: 0,
      buys: 0
    };
    entry.reach += numberOrZero(item.reach);
    entry.orders += numberOrZero(item.orders);
    entry.revenue += numberOrZero(item.revenue);
    entry.income += numberOrZero(item.income);
    entry.clicks += numberOrZero(item.clicks);
    entry.carts += numberOrZero(item.carts);
    entry.buys += numberOrZero(item.buys);
    if (!entry.item?.name && item.name) entry.item = item;
    map.set(key, entry);
  });
  return map;
}

function productLeaderboardWeeklyGrowthModel(current = null, previous = null) {
  if (!current || !previous) return null;
  const currentMap = productLeaderboardAggregateItemsByKey(current.items || []);
  const previousMap = productLeaderboardAggregateItemsByKey(previous.items || []);
  const keys = new Set([...currentMap.keys(), ...previousMap.keys()]);
  const wbArticleMap = productLeaderboardWbSubstitutionArticleMap();
  const rows = [...keys].map((key) => {
    const curr = currentMap.get(key) || { item: {}, orders: 0, revenue: 0, clicks: 0, carts: 0, buys: 0 };
    const prev = previousMap.get(key) || { item: {}, orders: 0, revenue: 0, clicks: 0, carts: 0, buys: 0 };
    const item = curr.item && (curr.item.name || curr.item.articleKey || curr.item.article) ? curr.item : prev.item;
    const bucket = productLeaderboardTrafficBucketForItem({
      ...prev.item,
      ...curr.item,
      traffic: item.traffic || curr.item?.traffic || prev.item?.traffic || ''
    }, wbArticleMap);
    return {
      key,
      item,
      currentItem: curr.item || {},
      previousItem: prev.item || {},
      bucket,
      orders: curr.orders,
      previousOrders: prev.orders,
      ordersDelta: curr.orders - prev.orders,
      revenue: curr.revenue,
      previousRevenue: prev.revenue,
      revenueDelta: curr.revenue - prev.revenue,
      clicks: curr.clicks,
      previousClicks: prev.clicks,
      clicksDelta: curr.clicks - prev.clicks,
      carts: curr.carts,
      previousCarts: prev.carts,
      cartsDelta: curr.carts - prev.carts,
      buys: curr.buys,
      previousBuys: prev.buys,
      buysDelta: curr.buys - prev.buys
    };
  }).filter((row) => row.ordersDelta || row.revenueDelta);
  const bucketDeltas = {
    kz: numberOrZero(current.orders?.kz) - numberOrZero(previous.orders?.kz),
    digital: numberOrZero(current.orders?.digital) - numberOrZero(previous.orders?.digital),
    organic: numberOrZero(current.orders?.organic) - numberOrZero(previous.orders?.organic)
  };
  return {
    current,
    previous,
    ordersDelta: numberOrZero(current.totalOrders) - numberOrZero(previous.totalOrders),
    revenueDelta: numberOrZero(current.totalRevenue) - numberOrZero(previous.totalRevenue),
    bucketDeltas,
    positive: rows.filter((row) => row.ordersDelta > 0).sort((left, right) => right.ordersDelta - left.ordersDelta).slice(0, 4),
    negative: rows.filter((row) => row.ordersDelta < 0).sort((left, right) => left.ordersDelta - right.ordersDelta).slice(0, 2)
  };
}

function productLeaderboardFirstMetricNumber(...values) {
  for (const value of values) {
    const parsed = productLeaderboardNumberOrNull(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function productLeaderboardDriverStockValue(item = {}) {
  return productLeaderboardFirstMetricNumber(
    item.stock,
    item.stockWb,
    item.wbStock,
    item.stockWarehouse,
    item.warehouseStock,
    item.wb?.stock,
    item.ozon?.stock
  );
}

function productLeaderboardWarehouseOverlayForItem(item = {}, key = '') {
  const articleKey = String(item.articleKey || key || '').trim().toLowerCase();
  if (!articleKey) return null;
  const rows = Array.isArray(state.warehouseStockOverlay?.rows) ? state.warehouseStockOverlay.rows : [];
  return rows.find((row = {}) => {
    const rowKey = String(row.articleKey || '').trim().toLowerCase();
    const sourceKeys = Array.isArray(row.sourceKeys) ? row.sourceKeys : [];
    return rowKey === articleKey || sourceKeys.some((sourceKey) => String(sourceKey || '').trim().toLowerCase() === articleKey);
  }) || null;
}

function productLeaderboardSkuStockForItem(item = {}, key = '') {
  try {
    const skuKey = item.articleKey || key || item.article || '';
    const sku = skuKey && typeof getSku === 'function' ? getSku(skuKey) : null;
    if (!sku) return 0;
    return numberOrZero(sku.wb?.stock) + numberOrZero(sku.ozon?.stock);
  } catch (_error) {
    return 0;
  }
}

function productLeaderboardDriverRate(numerator, denominator, fallback = null) {
  const den = numberOrZero(denominator);
  if (den > 0) return numberOrZero(numerator) / den;
  return fallback === null || fallback === undefined || Number.isNaN(Number(fallback)) ? null : Number(fallback);
}

function productLeaderboardDriverReasonBadges(row = {}, tone = 'ok') {
  const item = row.item || {};
  const currentItem = row.currentItem || item;
  const previousItem = row.previousItem || {};
  const reasons = [];
  const add = (label, reasonTone = 'info', title = '') => {
    if (!label || reasons.some((reason) => reason.label === label)) return;
    reasons.push({ label, tone: reasonTone, title });
  };

  if (row.bucket === 'kz') add('КЗ', 'kz', 'SKU растет внутри КЗ-листа');
  if (row.bucket === 'organic') add('органика', 'organic', 'Рост без КЗ/digital-метки');

  const currentPrice = productLeaderboardPriceMetrics(currentItem).main;
  const previousPrice = productLeaderboardPriceMetrics(previousItem).main;
  if (currentPrice !== null && previousPrice !== null && previousPrice > 0) {
    const priceDelta = (currentPrice - previousPrice) / previousPrice;
    if (tone === 'ok' && priceDelta <= -0.01) add('цена ↓', 'price', `${fmt.money(previousPrice)} -> ${fmt.money(currentPrice)}`);
    if (tone !== 'ok' && priceDelta >= 0.01) add('цена ↑', 'warn', `${fmt.money(previousPrice)} -> ${fmt.money(currentPrice)}`);
  }

  const currentStock = productLeaderboardDriverStockValue(currentItem);
  const previousStock = productLeaderboardDriverStockValue(previousItem);
  const warehouseRow = productLeaderboardWarehouseOverlayForItem(item, row.key);
  const shippedToMarketplace = numberOrZero(warehouseRow?.shippedWB) + numberOrZero(warehouseRow?.shippedOzon);
  const skuStock = productLeaderboardSkuStockForItem(item, row.key);
  if (currentStock !== null && previousStock !== null && currentStock > previousStock) {
    add('остаток ↑', 'stock', `${fmt.int(previousStock)} -> ${fmt.int(currentStock)}`);
  } else if (tone === 'ok' && shippedToMarketplace > 0 && numberOrZero(row.ordersDelta) > 0) {
    add('остаток ↑', 'stock', `отгружено на площадки ${fmt.int(shippedToMarketplace)}`);
  } else if (tone === 'ok' && skuStock > 0 && numberOrZero(row.ordersDelta) > 0) {
    add('остаток ↑', 'stock', `остаток на МП ${fmt.int(skuStock)}`);
  }

  if (numberOrZero(row.clicksDelta) > 0 && row.bucket !== 'organic') {
    add('реклама ↑', 'ads', `${productLeaderboardSignedInt(row.clicksDelta)} кликов`);
  } else if (numberOrZero(row.clicksDelta) < 0 && row.bucket !== 'organic') {
    add('реклама ↓', 'danger', `${productLeaderboardSignedInt(row.clicksDelta)} кликов`);
  }

  const currentCartRate = productLeaderboardDriverRate(row.carts, row.clicks, currentItem.cartRatePct);
  const previousCartRate = productLeaderboardDriverRate(row.previousCarts, row.previousClicks, previousItem.cartRatePct);
  const currentOrderRate = productLeaderboardDriverRate(row.orders, row.clicks, currentItem.conversionPct ?? currentItem.buyRatePct);
  const previousOrderRate = productLeaderboardDriverRate(row.previousOrders, row.previousClicks, previousItem.conversionPct ?? previousItem.buyRatePct);
  const cartRateDelta = currentCartRate !== null && previousCartRate !== null ? currentCartRate - previousCartRate : 0;
  const orderRateDelta = currentOrderRate !== null && previousOrderRate !== null ? currentOrderRate - previousOrderRate : 0;
  if (tone === 'ok' && (cartRateDelta >= 0.01 || orderRateDelta >= 0.004)) {
    add('карточка улучшена', 'card', `конверсия ${productLeaderboardSignedPp(orderRateDelta)}`);
  } else if (tone !== 'ok' && (cartRateDelta <= -0.01 || orderRateDelta <= -0.004)) {
    add('карточка просела', 'danger', `конверсия ${productLeaderboardSignedPp(orderRateDelta)}`);
  }

  const previousClicks = numberOrZero(row.previousClicks);
  const clicksGrowth = previousClicks > 0 ? numberOrZero(row.clicksDelta) / previousClicks : 0;
  if (numberOrZero(row.ordersDelta) > 0 && numberOrZero(row.cartsDelta) > 0 && clicksGrowth >= 0.18) {
    add('сезонность', 'season', `клики ${productLeaderboardSignedInt(row.clicksDelta)}`);
  }

  return reasons.slice(0, 5);
}

function productLeaderboardWeeklyGrowthDriverReasonsHtml(row = {}, tone = 'ok') {
  const reasons = productLeaderboardDriverReasonBadges(row, tone);
  if (!reasons.length) return '';
  return `
    <div class="product-leaderboard-weekly-bi-driver__reasons" aria-label="Почему изменился SKU">
      ${reasons.map((reason) => `<span class="is-${escapeHtml(reason.tone)}" title="${escapeHtml(reason.title || reason.label)}">${escapeHtml(reason.label)}</span>`).join('')}
    </div>
  `;
}

function productLeaderboardWeeklyGrowthDriverHtml(row = {}, tone = 'ok', options = {}) {
  const item = row.item || {};
  const title = item.name || item.articleKey || item.article || row.key || 'SKU';
  const source = item.articleKey || row.key || '';
  const wb = item.article ? `WB ${item.article}` : '';
  const link = [source, wb].filter(Boolean).join(' -> ');
  const owner = item.owner ? item.owner : 'owner не назначен';
  const bucket = productLeaderboardBucketLabel(row.bucket);
  const power = Math.max(8, Math.min(100, Math.abs(numberOrZero(row.ordersDelta)) / Math.max(1, numberOrZero(options.maxAbsOrders)) * 100));
  const deltaClass = tone === 'ok' ? 'ok-text' : 'danger-text';
  const rank = Number(options.rank) || 1;
  return `
    <article class="product-leaderboard-weekly-bi-driver is-${escapeHtml(tone)}" style="--driver-power:${power.toFixed(1)}%">
      <span class="product-leaderboard-weekly-bi-driver__rank">${escapeHtml(tone === 'ok' ? `рост #${rank}` : `риск #${rank}`)}</span>
      <b class="${deltaClass}">${escapeHtml(productLeaderboardSignedInt(row.ordersDelta))} заказов</b>
      <strong>${escapeHtml(title)}</strong>
      <em>${escapeHtml(bucket)}</em>
      ${productLeaderboardWeeklyGrowthDriverReasonsHtml(row, tone)}
      <div class="product-leaderboard-weekly-bi-driver__route">
        <span>${escapeHtml(source || 'SKU')}</span>
        <i></i>
        <span>${escapeHtml(wb || 'WB')}</span>
      </div>
      <div class="product-leaderboard-weekly-bi-driver__owner">${escapeHtml(owner)}</div>
      <div class="product-leaderboard-weekly-bi-driver__stats">
        <span><b>${escapeHtml(productLeaderboardSignedMoney(row.revenueDelta))}</b><em>выручка</em></span>
        <span><b>${escapeHtml(productLeaderboardSignedInt(row.clicksDelta))}</b><em>клики</em></span>
        <span><b>${escapeHtml(productLeaderboardSignedInt(row.cartsDelta))}</b><em>корзины</em></span>
      </div>
      <span class="product-leaderboard-weekly-bi-driver__bar"><i></i></span>
    </article>
  `;
}

function productLeaderboardWeeklyGrowthHtml(model = null) {
  if (!model) return '';
  const driverRows = [...model.positive, ...model.negative];
  const maxAbsOrders = Math.max(1, ...driverRows.map((row) => Math.abs(numberOrZero(row.ordersDelta))));
  const buckets = [
    { label: 'WB подменники', value: model.bucketDeltas.kz, tone: model.bucketDeltas.kz >= 0 ? 'ok' : 'danger' },
    { label: 'digital', value: model.bucketDeltas.digital, tone: model.bucketDeltas.digital >= 0 ? 'ok' : 'danger' },
    { label: 'без метки', value: model.bucketDeltas.organic, tone: model.bucketDeltas.organic >= 0 ? 'ok' : 'danger' }
  ];
  const positive = model.positive.map((row, index) => productLeaderboardWeeklyGrowthDriverHtml(row, 'ok', { rank: index + 1, maxAbsOrders })).join('');
  const negative = model.negative.map((row, index) => productLeaderboardWeeklyGrowthDriverHtml(row, 'danger', { rank: index + 1, maxAbsOrders })).join('');
  const currentLabel = model.current?.range?.fromLabel && model.current?.range?.toLabel
    ? `${model.current.range.fromLabel} - ${model.current.range.toLabel}`
    : model.current?.weekLabel || 'текущая неделя';
  const previousLabel = model.previous?.range?.fromLabel && model.previous?.range?.toLabel
    ? `${model.previous.range.fromLabel} - ${model.previous.range.toLabel}`
    : model.previous?.weekLabel || 'предыдущая неделя';
  return `
    <div class="product-leaderboard-weekly-bi-growth">
      <div class="product-leaderboard-weekly-bi-growth__head">
        <div>
          <span>Рост за счет чего</span>
          <strong>${escapeHtml(productLeaderboardSignedInt(model.ordersDelta))} заказов</strong>
          <em>${escapeHtml(`${currentLabel} к ${previousLabel} · выручка ${productLeaderboardSignedMoney(model.revenueDelta)}`)}</em>
        </div>
        <div class="product-leaderboard-weekly-bi-growth__buckets">
          ${buckets.map((bucket) => `
            <span class="is-${escapeHtml(bucket.tone)}">
              <b>${escapeHtml(bucket.label)}</b>
              <em>${escapeHtml(productLeaderboardSignedInt(bucket.value))}</em>
            </span>
          `).join('')}
        </div>
      </div>
      <div class="product-leaderboard-weekly-bi-growth__drivers">
        ${positive || '<div class="product-leaderboard-weekly-bi-driver"><b>0 заказов</b><strong>Новых драйверов роста нет</strong><em>Сравнение недель без положительных скачков по SKU.</em></div>'}
        ${negative}
      </div>
    </div>
  `;
}

function productLeaderboardWeeklyChartLabel(row = {}) {
  const from = String(row.range?.fromLabel || '').slice(0, 5);
  const to = String(row.range?.toLabel || '').slice(0, 5);
  if (from && to) return `${from}-${to}`;
  return String(row.weekLabel || '').replace(/\.\d{4}/g, '').replace(/\s+/g, ' ').trim();
}

function productLeaderboardWeeklyStackedChartHtml(rows = [], maxOrders = 1, selectedKey = '') {
  const safeRows = (Array.isArray(rows) ? rows : []).filter((row) => numberOrZero(row.totalOrders) > 0);
  if (!safeRows.length) return '';
  return `
    <div class="product-leaderboard-weekly-bi-chart">
      <div class="product-leaderboard-weekly-bi-chart__head">
        <div>
          <span>Недельные столбики</span>
          <strong>КЗ-лист по структуре заказов</strong>
          <em>Какая неделя растет и чем она наполнена.</em>
        </div>
        <div class="product-leaderboard-weekly-bi-chart__legend" aria-label="Легенда недельного графика">
          <span><i class="is-kz"></i>WB подменники</span>
          <span><i class="is-digital"></i>digital</span>
          <span><i class="is-organic"></i>без метки</span>
        </div>
      </div>
      <div class="product-leaderboard-weekly-bi-chart__plot" style="--weekly-columns:${safeRows.length}">
        ${safeRows.map((row) => {
          const total = Math.max(1, numberOrZero(row.totalOrders));
          const scale = Math.max(18, Math.min(100, total / Math.max(1, maxOrders) * 100));
          const kzPct = Math.max(0, Math.min(100, numberOrZero(row.orders.kz) / total * 100));
          const digitalPct = Math.max(0, Math.min(100, numberOrZero(row.orders.digital) / total * 100));
          const organicPct = Math.max(0, Math.min(100, numberOrZero(row.orders.organic) / total * 100));
          const weekLabel = productLeaderboardWeeklyChartLabel(row);
          const isActive = productLeaderboardWeeklyRowSnapshotMatch(row, selectedKey);
          const tooltip = `${weekLabel}: всего ${fmt.int(total)} заказов · WB подменники ${fmt.int(row.orders.kz)} · digital ${fmt.int(row.orders.digital)} · без метки ${fmt.int(row.orders.organic)} · выручка ${fmt.money(row.totalRevenue)}`;
          return `
            <button
              type="button"
              class="product-leaderboard-weekly-bi-column${isActive ? ' is-active' : ''}"
              style="--column-scale:${scale.toFixed(1)}%"
              data-product-week-snapshot="${escapeHtml(row.snapshotKey || '')}"
              title="${escapeHtml(tooltip)}"
              aria-label="${escapeHtml(`Выбрать неделю ${weekLabel}`)}"
            >
              <div class="product-leaderboard-weekly-bi-column__value">
                <b>${fmt.int(total)}</b>
                ${row.ordersDelta == null ? '' : `<em class="${row.ordersDelta >= 0 ? 'ok-text' : 'danger-text'}">${escapeHtml(productLeaderboardSignedInt(row.ordersDelta))}</em>`}
              </div>
              <div class="product-leaderboard-weekly-bi-column__stack">
                <i class="is-kz" style="height:${kzPct.toFixed(1)}%"></i>
                <i class="is-digital" style="height:${digitalPct.toFixed(1)}%"></i>
                <i class="is-organic" style="height:${organicPct.toFixed(1)}%"></i>
              </div>
              <div class="product-leaderboard-weekly-bi-column__tooltip">
                <b>${escapeHtml(weekLabel)}</b>
                <span>WB подменники ${fmt.int(row.orders.kz)} · ${fmt.pct(row.kzShare)}</span>
                <span>digital ${fmt.int(row.orders.digital)} · ${fmt.pct(row.digitalShare)}</span>
                <span>без метки ${fmt.int(row.orders.organic)} · ${fmt.pct(row.organicShare)}</span>
                <span>выручка ${fmt.money(row.totalRevenue)}</span>
              </div>
              <div class="product-leaderboard-weekly-bi-column__label">
                <b>${escapeHtml(weekLabel)}</b>
                <em>${fmt.int(row.skuCount)} SKU</em>
              </div>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderProductLeaderboardWeeklyTrendHtml(orderContour = {}, selectedPayload = {}, filters = {}) {
  const rows = productLeaderboardWeeklyShareRows();
  if (!rows.length) return '';
  const selectedKey = String(filters.snapshot || productLeaderboardSnapshotKey(selectedPayload, 0) || 'latest');
  const current = rows.find((row) => productLeaderboardWeeklyRowSnapshotMatch(row, selectedKey))
    || rows.find((row) => row.weekLabel === selectedPayload.weekLabel)
    || rows[rows.length - 1];
  const previous = current.previous;
  const maxOrders = Math.max(1, ...rows.map((row) => numberOrZero(row.totalOrders)));
  const currentLabel = current.range.fromLabel && current.range.toLabel ? `${current.range.fromLabel} - ${current.range.toLabel}` : current.weekLabel;
  const previousLabel = previous ? (previous.range.fromLabel && previous.range.toLabel ? `${previous.range.fromLabel} - ${previous.range.toLabel}` : previous.weekLabel) : '';
  const weeklyTotalOrders = numberOrZero(current.totalOrders);
  const kzMarkedOrders = numberOrZero(current.orders.kz);
  const digitalOrders = numberOrZero(current.orders.digital);
  const unmarkedOrganicOrders = numberOrZero(current.orders.organic);
  const mpAds = productLeaderboardMarketplaceAdsShareModel(current, filters);
  const kzMarkedShare = weeklyTotalOrders > 0 ? kzMarkedOrders / weeklyTotalOrders : null;
  const digitalShare = weeklyTotalOrders > 0 ? digitalOrders / weeklyTotalOrders : null;
  const unmarkedOrganicShare = weeklyTotalOrders > 0 ? unmarkedOrganicOrders / weeklyTotalOrders : null;
  const growthModel = productLeaderboardWeeklyGrowthModel(current, previous);
  const cards = [
    {
      className: 'is-kz',
      label: 'WB подменники / неделя',
      value: kzMarkedShare == null ? '—' : fmt.pct(kzMarkedShare),
      meta: `${fmt.int(kzMarkedOrders)} из ${fmt.int(weeklyTotalOrders)} заказов`,
      delta: null,
      progress: kzMarkedShare,
      hue: 42
    },
    {
      className: 'is-digital',
      label: 'Digital / неделя',
      value: digitalShare == null ? '—' : fmt.pct(digitalShare),
      meta: `${fmt.int(digitalOrders)} из ${fmt.int(weeklyTotalOrders)} заказов`,
      delta: null,
      detail: '',
      progress: digitalShare,
      hue: 218
    },
    {
      className: 'is-organic',
      label: 'Органика / без метки',
      value: unmarkedOrganicShare == null ? '—' : fmt.pct(unmarkedOrganicShare),
      meta: `${fmt.int(unmarkedOrganicOrders)} из ${fmt.int(weeklyTotalOrders)} заказов`,
      delta: null,
      progress: unmarkedOrganicShare,
      hue: 145
    },
    {
      className: 'is-ads',
      label: 'Реклама МП / заказы МП',
      value: mpAds.share == null ? '—' : fmt.pct(mpAds.share),
      meta: mpAds.totalOrders > 0 ? `${fmt.int(mpAds.adsOrders)} из ${fmt.int(mpAds.totalOrders)} заказов` : 'нет деноминатора МП',
      delta: null,
      detail: `${mpAds.date || 'текущий срез'} · ${mpAds.detail || `WB ${fmt.int(mpAds.wbAdsOrders)} · Ozon ${fmt.int(mpAds.ozonAdsOrders)}`}`,
      progress: mpAds.share,
      hue: 12
    }
  ];
  return `
    <div class="product-leaderboard-weekly-bi">
      <div class="section-subhead">
        <div>
          <h3>BI-срез заказов: КЗ / digital / органика / реклама МП</h3>
          <p class="small muted">Доли, недельные столбики и SKU-драйверы роста в одном блоке.</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(rows.length)} недель`, rows.length > 1 ? 'info' : 'warn')}
          ${badge(currentLabel, 'info')}
          ${previousLabel ? badge(`сравнение: ${previousLabel}`, 'info') : ''}
        </div>
      </div>
      ${productLeaderboardWeeklyStackedChartHtml(rows, maxOrders, current.snapshotKey || selectedKey)}
      <div class="product-leaderboard-weekly-bi-picker">
        <div>
          <span>Фильтр недели</span>
          <strong>${escapeHtml(currentLabel)}</strong>
          <em>${previousLabel ? `сравнение: ${escapeHtml(previousLabel)}` : 'первый срез, без базы сравнения'}</em>
        </div>
        <select data-product-leaderboard-snapshot aria-label="Выбрать неделю для продуктового лидерборда">
          ${rows.slice().reverse().map((row) => {
            const label = row.range.fromLabel && row.range.toLabel ? `${row.range.fromLabel} - ${row.range.toLabel}` : row.weekLabel;
            const key = row.snapshotKey || row.weekLabel;
            return `<option value="${escapeHtml(key)}" ${productLeaderboardWeeklyRowSnapshotMatch(row, current.snapshotKey || selectedKey) ? 'selected' : ''}>${escapeHtml(label)} · ${fmt.int(row.totalOrders)} заказов</option>`;
          }).join('')}
        </select>
      </div>
      <div class="product-leaderboard-weekly-bi__cards">
        ${cards.map(productLeaderboardWeeklyTrendCardHtml).join('')}
      </div>
      ${productLeaderboardWeeklyGrowthHtml(growthModel)}
      <details class="product-leaderboard-weekly-bi-details">
        <summary>Расшифровка недель</summary>
        <div class="product-leaderboard-weekly-bi__rows">
          ${rows.map((row) => {
            const kzPct = row.kzShare == null ? 0 : Math.max(0, Math.min(100, row.kzShare * 100));
            const digitalPct = row.digitalShare == null ? 0 : Math.max(0, Math.min(100, row.digitalShare * 100));
            const organicPct = row.organicShare == null ? 0 : Math.max(0, Math.min(100, row.organicShare * 100));
            const week = row.range.fromLabel && row.range.toLabel ? `${row.range.fromLabel} - ${row.range.toLabel}` : row.weekLabel;
            const barScale = Math.max(8, Math.min(100, numberOrZero(row.totalOrders) / maxOrders * 100));
            return `
              <div class="product-leaderboard-weekly-bi-row">
                <span class="product-leaderboard-weekly-bi-row__label">
                  <b>${escapeHtml(week)}</b>
                  <em>${fmt.int(row.totalOrders)} заказов · ${fmt.int(row.skuCount)} SKU</em>
                </span>
                <span class="product-leaderboard-weekly-bi-row__track" style="--week-scale:${barScale.toFixed(1)}%">
                  <i class="is-kz" style="width:${kzPct.toFixed(1)}%"></i>
                  <i class="is-digital" style="width:${digitalPct.toFixed(1)}%"></i>
                  <i class="is-organic" style="width:${organicPct.toFixed(1)}%"></i>
                </span>
                <span class="product-leaderboard-weekly-bi-row__shares">
                  <b>КЗ-лист ${fmt.int(row.totalOrders)}</b>
                  <em>внутри листа: WB подменники ${fmt.int(row.orders.kz)} · digital ${fmt.int(row.orders.digital)} · без метки ${fmt.int(row.orders.organic)}</em>
                </span>
              </div>
            `;
          }).join('')}
        </div>
      </details>
    </div>
  `;
}

function productLeaderboardItemCompareKey(item = {}) {
  return productLeaderboardSubstitutionKey(item.articleKey || item.article || item.sku || item.vendorCode || item.name || item.id || '');
}

function productLeaderboardSignedInt(value) {
  const numeric = Math.round(numberOrZero(value));
  const sign = numeric > 0 ? '+' : numeric < 0 ? '-' : '';
  return `${sign}${fmt.int(Math.abs(numeric))}`;
}

function productLeaderboardSafeRatio(numerator, denominator) {
  const top = Number(numerator);
  const bottom = Number(denominator);
  return Number.isFinite(top) && Number.isFinite(bottom) && bottom > 0 ? top / bottom : null;
}

function normalizeWbSubstitutionTrafficPayload(payload = {}) {
  const source = payload.source && typeof payload.source === 'object' ? payload.source : {};
  return {
    schema: payload.schema || 'portal-wb-substitution-traffic-v1',
    generatedAt: payload.generatedAt || '',
    asOfDate: payload.asOfDate || '',
    source,
    summary: payload.summary || {},
    articles: Array.isArray(payload.articles) ? payload.articles : [],
    rows: Array.isArray(payload.rows) ? payload.rows : []
  };
}

function wbSubstitutionTrafficSnapshotStamp(snapshot = {}) {
  return snapshot.source?.sourceGeneratedAt || snapshot.generatedAt || snapshot.asOfDate || '';
}

function wbSubstitutionTrafficSnapshotDedupeKey(snapshot = {}) {
  const sourceStamp = snapshot.source?.sourceGeneratedAt || snapshot.asOfDate || snapshot.generatedAt || '';
  const sourceFile = snapshot.source?.fileName || snapshot.source?.file || '';
  return [sourceStamp, sourceFile].filter(Boolean).join('|') || snapshot.generatedAt || '';
}

function wbSubstitutionTrafficHistoryPayloads() {
  const current = normalizeWbSubstitutionTrafficPayload(state.wbSubstitutionTraffic || {});
  const history = Array.isArray(state.wbSubstitutionTrafficHistory)
    ? state.wbSubstitutionTrafficHistory.map((item) => normalizeWbSubstitutionTrafficPayload(item || {}))
    : [];
  const seen = new Set();
  return [current, ...history]
    .filter((item) => item.generatedAt || item.asOfDate || item.source?.sourceGeneratedAt || item.rows.length || item.articles.length)
    .filter((item) => {
      const key = wbSubstitutionTrafficSnapshotDedupeKey(item);
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => parseFreshStamp(wbSubstitutionTrafficSnapshotStamp(right)) - parseFreshStamp(wbSubstitutionTrafficSnapshotStamp(left)));
}

function wbSubstitutionTrafficSnapshotKey(snapshot = {}, index = 0) {
  if (index === 0) return 'latest';
  return wbSubstitutionTrafficSnapshotDedupeKey(snapshot) || `wb-substitution-${index}`;
}

function wbSubstitutionTrafficSnapshotLabel(snapshot = {}, index = 0) {
  const sourceDate = snapshot.asOfDate || (snapshot.source?.sourceGeneratedAt || '').slice(0, 10) || (snapshot.generatedAt || '').slice(0, 10);
  const sourceTime = snapshot.source?.sourceGeneratedAt || snapshot.generatedAt || '';
  const sourceName = snapshot.source?.fileName || snapshot.source?.file || '';
  const base = sourceDate || (index === 0 ? 'Текущий срез' : `Срез ${index + 1}`);
  const timeLabel = sourceTime ? ` · ${fmt.date(sourceTime)}` : '';
  const nameLabel = sourceName ? ` · ${sourceName.replace(/\.xlsx$/i, '')}` : '';
  return `${base}${timeLabel}${nameLabel}`;
}

function wbSubstitutionTrafficSnapshotOptions() {
  return wbSubstitutionTrafficHistoryPayloads().map((snapshot, index) => ({
    snapshot,
    index,
    key: wbSubstitutionTrafficSnapshotKey(snapshot, index),
    label: wbSubstitutionTrafficSnapshotLabel(snapshot, index)
  }));
}

function productLeaderboardExternalArticleRows(payload = {}, filters = {}, items = []) {
  const normalizedPayload = normalizeWbSubstitutionTrafficPayload(payload);
  const hasActiveFilter = productLeaderboardHasActiveFilters(filters);
  const visibleKeys = new Set((Array.isArray(items) ? items : [])
    .map((item) => productLeaderboardSubstitutionKey(item.articleKey || item.article || item.sku || item.vendorCode || ''))
    .filter(Boolean));
  const map = new Map();
  normalizedPayload.rows.forEach((row = {}) => {
    const sourceKey = productLeaderboardSubstitutionArticleKey(row);
    if (hasActiveFilter && visibleKeys.size > 0 && !visibleKeys.has(sourceKey)) return;
    const substitutionKey = productLeaderboardSubstitutionKey(row.substitutionArticle || row.substitution || row.substitutionSku || '');
    if (!sourceKey || !substitutionKey) return;
    const key = `${sourceKey}__${substitutionKey}`;
    const sourceArticle = row.articleKey || row.sellerArticle || row.article || row.productId || '';
    const sourceArticleLabel = row.articleKey || row.sellerArticle || row.article || sourceKey;
    const substitutionLabel = row.substitutionArticle || row.substitution || row.substitutionSku || substitutionKey;
    const current = map.get(key) || {
      key,
      label: substitutionLabel,
      substitutionKey,
      substitutionLabel,
      sourceArticleKey: sourceKey,
      sourceArticleLabel,
      sourceTitle: row.title || row.name || '',
      views: 0,
      carts: 0,
      orders: 0,
      favorites: 0,
      campaignBudget: 0,
      rowCount: 0,
      campaigns: new Set(),
      trafficSources: new Set(),
      sourceArticles: new Set(),
      sourceArticleOrders: new Map()
    };
    const views = numberOrZero(row.views);
    const carts = numberOrZero(row.carts);
    const orders = numberOrZero(row.orders);
    const favorites = numberOrZero(row.favorites);
    current.views += views;
    current.carts += carts;
    current.orders += orders;
    current.favorites += favorites;
    current.campaignBudget += numberOrZero(row.campaignBudget);
    current.rowCount += 1;
    if (row.campaignName) current.campaigns.add(String(row.campaignName));
    if (row.trafficSource) current.trafficSources.add(String(row.trafficSource));
    if (sourceArticle) {
      current.sourceArticles.add(String(sourceArticle));
      current.sourceArticleOrders.set(String(sourceArticle), numberOrZero(current.sourceArticleOrders.get(String(sourceArticle))) + orders);
    }
    map.set(key, current);
  });
  return [...map.values()].map((item) => {
    const topSourceArticles = [...item.sourceArticleOrders.entries()]
      .sort((left, right) => numberOrZero(right[1]) - numberOrZero(left[1]) || String(left[0]).localeCompare(String(right[0]), 'ru'))
      .slice(0, 4)
      .map(([label, orders]) => ({ label, orders }));
    return {
      key: item.key,
      label: item.label,
      substitutionKey: item.substitutionKey,
      substitutionLabel: item.substitutionLabel,
      sourceArticleKey: item.sourceArticleKey,
      sourceArticleLabel: item.sourceArticleLabel,
      sourceTitle: item.sourceTitle,
      views: item.views,
      carts: item.carts,
      orders: item.orders,
      favorites: item.favorites,
      campaignBudget: item.campaignBudget,
      rowCount: item.rowCount,
      campaignCount: item.campaigns.size,
      trafficSourceCount: item.trafficSources.size,
      sourceArticleCount: item.sourceArticles.size,
      topSourceArticles,
      cartRate: productLeaderboardSafeRatio(item.carts, item.views),
      orderRate: productLeaderboardSafeRatio(item.orders, item.views)
    };
  }).sort((left, right) => (
    numberOrZero(right.orders) - numberOrZero(left.orders)
    || numberOrZero(right.views) - numberOrZero(left.views)
    || String(left.sourceArticleLabel || '').localeCompare(String(right.sourceArticleLabel || ''), 'ru')
    || String(left.substitutionLabel || left.label || left.key).localeCompare(String(right.substitutionLabel || right.label || right.key), 'ru')
  ));
}

function productLeaderboardExternalArticleSummary(rows = []) {
  return rows.reduce((summary, row) => {
    summary.articles += 1;
    summary.views += numberOrZero(row.views);
    summary.carts += numberOrZero(row.carts);
    summary.orders += numberOrZero(row.orders);
    summary.favorites += numberOrZero(row.favorites);
    summary.campaignBudget += numberOrZero(row.campaignBudget);
    summary.rowCount += numberOrZero(row.rowCount);
    summary.sourceArticleLinks += numberOrZero(row.sourceArticleCount);
    summary.campaignLinks += numberOrZero(row.campaignCount);
    return summary;
  }, {
    articles: 0,
    views: 0,
    carts: 0,
    orders: 0,
    favorites: 0,
    campaignBudget: 0,
    rowCount: 0,
    sourceArticleLinks: 0,
    campaignLinks: 0
  });
}

function productLeaderboardExternalLikeForLikeAnsOption(option = {}) {
  const rawKey = String(option.key || 'latest').trim() || 'latest';
  return {
    ...option,
    type: 'ans',
    rawKey,
    key: `ans:${rawKey}`,
    label: `ANS · ${option.label || rawKey}`
  };
}

function productLeaderboardExternalLikeForLikeLeaderboardOption(option = {}) {
  const rawKey = String(option.key || '').trim();
  return {
    ...option,
    type: 'leaderboard',
    rawKey,
    key: `leaderboard:${rawKey}`,
    label: `КЗ · ${option.label || rawKey || 'срез'}`
  };
}

function productLeaderboardExternalLikeForLikeOptionMatches(option = {}, value = '') {
  const key = String(value || '').trim();
  if (!key) return false;
  return option.key === key || option.rawKey === key;
}

function productLeaderboardExternalLikeForLikeEmptyRow(base = {}, key = '') {
  return {
    key,
    label: base.label || key,
    substitutionKey: base.substitutionKey || '',
    substitutionLabel: base.substitutionLabel || base.label || key,
    sourceArticleKey: base.sourceArticleKey || '',
    sourceArticleLabel: base.sourceArticleLabel || '',
    sourceTitle: base.sourceTitle || '',
    views: 0,
    clicks: 0,
    carts: 0,
    orders: 0,
    favorites: 0,
    campaignBudget: 0,
    rowCount: 0,
    campaignCount: 0,
    trafficSourceCount: 0,
    sourceArticleCount: 0,
    topSourceArticles: [],
    cartRate: null,
    orderRate: null
  };
}

function productLeaderboardExternalLikeForLikeRowsFromMaps(currentMap = new Map(), previousMap = new Map()) {
  const keys = new Set([...currentMap.keys(), ...previousMap.keys()]);
  return [...keys].map((key) => {
    const current = currentMap.get(key) || productLeaderboardExternalLikeForLikeEmptyRow(previousMap.get(key) || {}, key);
    const previous = previousMap.get(key) || productLeaderboardExternalLikeForLikeEmptyRow(currentMap.get(key) || {}, key);
    const ordersDelta = numberOrZero(current.orders) - numberOrZero(previous.orders);
    const viewsDelta = numberOrZero(current.views) - numberOrZero(previous.views);
    const cartsDelta = numberOrZero(current.carts) - numberOrZero(previous.carts);
    const favoritesDelta = numberOrZero(current.favorites) - numberOrZero(previous.favorites);
    const rowCountDelta = numberOrZero(current.rowCount) - numberOrZero(previous.rowCount);
    return {
      key,
      current,
      previous,
      ordersDelta,
      ordersDeltaPct: numberOrZero(previous.orders) > 0 ? ordersDelta / numberOrZero(previous.orders) : null,
      viewsDelta,
      viewsDeltaPct: numberOrZero(previous.views) > 0 ? viewsDelta / numberOrZero(previous.views) : null,
      cartsDelta,
      favoritesDelta,
      rowCountDelta,
      orderRateDelta: current.orderRate != null && previous.orderRate != null ? current.orderRate - previous.orderRate : null,
      status: currentMap.has(key) && previousMap.has(key) ? 'matched' : currentMap.has(key) ? 'new' : 'lost'
    };
  }).sort((left, right) => (
    numberOrZero(right.ordersDelta) - numberOrZero(left.ordersDelta)
    || numberOrZero(right.viewsDelta) - numberOrZero(left.viewsDelta)
    || numberOrZero(right.current.orders) - numberOrZero(left.current.orders)
    || String(left.current.sourceArticleLabel || left.previous.sourceArticleLabel || '').localeCompare(String(right.current.sourceArticleLabel || right.previous.sourceArticleLabel || ''), 'ru')
    || String(left.current.substitutionLabel || left.current.label || left.key).localeCompare(String(right.current.substitutionLabel || right.current.label || right.key), 'ru')
  ));
}

function productLeaderboardExternalLikeForLikeMetricRowFromAggregate(pairRow = {}, aggregate = null, options = {}) {
  const item = aggregate?.item || {};
  const clicks = numberOrZero(aggregate?.clicks ?? item.clicks);
  const views = numberOrZero(aggregate?.reach ?? item.reach) || clicks;
  const carts = numberOrZero(aggregate?.carts ?? item.carts);
  const orders = numberOrZero(aggregate?.orders ?? item.orders);
  const favorites = numberOrZero(aggregate?.buys ?? item.buys);
  const denominator = clicks || views;
  return {
    ...pairRow,
    sourceTitle: pairRow.sourceTitle || item.name || '',
    views,
    clicks,
    carts,
    orders,
    favorites,
    revenue: numberOrZero(aggregate?.revenue ?? item.revenue),
    income: numberOrZero(aggregate?.income ?? item.income),
    rowCount: options.keepPairStats ? numberOrZero(pairRow.rowCount) : 0,
    campaignCount: options.keepPairStats ? numberOrZero(pairRow.campaignCount) : 0,
    externalRowCount: numberOrZero(pairRow.rowCount),
    externalCampaignCount: numberOrZero(pairRow.campaignCount),
    cartRate: productLeaderboardSafeRatio(carts, denominator),
    orderRate: productLeaderboardSafeRatio(orders, denominator)
  };
}

function productLeaderboardExternalLikeForLikeLeaderboardSummary(sourceKeys = new Set(), aggregateMap = new Map()) {
  const summary = {
    articles: 0,
    views: 0,
    clicks: 0,
    carts: 0,
    orders: 0,
    favorites: 0,
    campaignBudget: 0,
    rowCount: 0,
    sourceArticleLinks: 0,
    campaignLinks: 0
  };
  sourceKeys.forEach((key) => {
    const aggregate = aggregateMap.get(key);
    if (!aggregate) return;
    summary.articles += 1;
    summary.views += numberOrZero(aggregate.reach) || numberOrZero(aggregate.clicks);
    summary.clicks += numberOrZero(aggregate.clicks);
    summary.carts += numberOrZero(aggregate.carts);
    summary.orders += numberOrZero(aggregate.orders);
    summary.favorites += numberOrZero(aggregate.buys);
  });
  summary.sourceArticleLinks = summary.articles;
  summary.cartRate = productLeaderboardSafeRatio(summary.carts, summary.clicks || summary.views);
  summary.orderRate = productLeaderboardSafeRatio(summary.orders, summary.clicks || summary.views);
  return summary;
}

function productLeaderboardExternalLikeForLikeLeaderboardComparison(currentRows = [], compareOption = null, filteredItems = []) {
  const currentPayload = currentProductLeaderboardPayload();
  const currentItems = Array.isArray(filteredItems) && filteredItems.length
    ? filteredItems
    : (Array.isArray(currentPayload.items) ? currentPayload.items : []);
  const previousItems = Array.isArray(compareOption?.snapshot?.items) ? compareOption.snapshot.items : [];
  const currentItemMap = productLeaderboardAggregateItemsByKey(currentItems);
  const previousItemMap = productLeaderboardAggregateItemsByKey(previousItems);
  const sourceKeys = new Set(currentRows.map((row) => row.sourceArticleKey).filter(Boolean));
  const rows = currentRows.map((pairRow) => {
    const sourceKey = pairRow.sourceArticleKey || '';
    const currentAggregate = sourceKey ? currentItemMap.get(sourceKey) : null;
    const previousAggregate = sourceKey ? previousItemMap.get(sourceKey) : null;
    const current = productLeaderboardExternalLikeForLikeMetricRowFromAggregate(pairRow, currentAggregate, { keepPairStats: true });
    const previous = productLeaderboardExternalLikeForLikeMetricRowFromAggregate(pairRow, previousAggregate, { keepPairStats: false });
    const ordersDelta = numberOrZero(current.orders) - numberOrZero(previous.orders);
    const viewsDelta = numberOrZero(current.views) - numberOrZero(previous.views);
    const cartsDelta = numberOrZero(current.carts) - numberOrZero(previous.carts);
    const favoritesDelta = numberOrZero(current.favorites) - numberOrZero(previous.favorites);
    return {
      key: pairRow.key,
      current,
      previous,
      ordersDelta,
      ordersDeltaPct: numberOrZero(previous.orders) > 0 ? ordersDelta / numberOrZero(previous.orders) : null,
      viewsDelta,
      viewsDeltaPct: numberOrZero(previous.views) > 0 ? viewsDelta / numberOrZero(previous.views) : null,
      cartsDelta,
      favoritesDelta,
      rowCountDelta: numberOrZero(current.rowCount) - numberOrZero(previous.rowCount),
      orderRateDelta: current.orderRate != null && previous.orderRate != null ? current.orderRate - previous.orderRate : null,
      status: currentAggregate && previousAggregate ? 'matched' : currentAggregate ? 'new' : 'lost'
    };
  }).sort((left, right) => (
    numberOrZero(right.ordersDelta) - numberOrZero(left.ordersDelta)
    || numberOrZero(right.viewsDelta) - numberOrZero(left.viewsDelta)
    || numberOrZero(right.current.orders) - numberOrZero(left.current.orders)
    || String(left.current.sourceArticleLabel || '').localeCompare(String(right.current.sourceArticleLabel || ''), 'ru')
    || String(left.current.substitutionLabel || left.current.label || left.key).localeCompare(String(right.current.substitutionLabel || right.current.label || right.key), 'ru')
  ));
  return {
    rows,
    previousRows: rows.map((row) => row.previous),
    currentSummary: productLeaderboardExternalLikeForLikeLeaderboardSummary(sourceKeys, currentItemMap),
    previousSummary: productLeaderboardExternalLikeForLikeLeaderboardSummary(sourceKeys, previousItemMap)
  };
}

function productLeaderboardExternalLikeForLikeModel(filters = {}, filteredItems = []) {
  const options = wbSubstitutionTrafficSnapshotOptions().map(productLeaderboardExternalLikeForLikeAnsOption);
  const leaderboardOptions = productLeaderboardSnapshotSelectOptions(productLeaderboardHistoryPayloads())
    .filter((option) => option.key !== 'latest' && Array.isArray(option.snapshot?.items) && option.snapshot.items.length)
    .map(productLeaderboardExternalLikeForLikeLeaderboardOption);
  const currentKey = String(filters.lflCurrentSnapshot || 'latest');
  const currentOption = options.find((option) => productLeaderboardExternalLikeForLikeOptionMatches(option, currentKey)) || options[0] || null;
  const compareKey = String(filters.lflCompareSnapshot || '');
  const ansCompareOptions = options.filter((option) => !currentOption || option.rawKey !== currentOption.rawKey);
  const compareOptions = [...ansCompareOptions, ...leaderboardOptions];
  const compareOption = compareOptions.find((option) => productLeaderboardExternalLikeForLikeOptionMatches(option, compareKey))
    || compareOptions[0]
    || null;
  const currentRows = currentOption ? productLeaderboardExternalArticleRows(currentOption.snapshot, filters, filteredItems) : [];
  const comparisonMode = compareOption?.type === 'leaderboard' ? 'leaderboard' : 'ans';
  const comparison = comparisonMode === 'leaderboard'
    ? productLeaderboardExternalLikeForLikeLeaderboardComparison(currentRows, compareOption, filteredItems)
    : (() => {
      const previousRows = compareOption ? productLeaderboardExternalArticleRows(compareOption.snapshot, filters, filteredItems) : [];
      const currentMap = new Map(currentRows.map((row) => [row.key, row]));
      const previousMap = new Map(previousRows.map((row) => [row.key, row]));
      return {
        rows: productLeaderboardExternalLikeForLikeRowsFromMaps(currentMap, previousMap),
        previousRows,
        currentSummary: productLeaderboardExternalArticleSummary(currentRows),
        previousSummary: productLeaderboardExternalArticleSummary(previousRows)
      };
    })();
  const rows = comparison.rows;
  const previousRows = comparison.previousRows;
  const currentSummary = comparison.currentSummary;
  const previousSummary = comparison.previousSummary;
  const ordersDelta = currentSummary.orders - previousSummary.orders;
  const viewsDelta = currentSummary.views - previousSummary.views;
  const cartsDelta = currentSummary.carts - previousSummary.carts;
  const favoritesDelta = currentSummary.favorites - previousSummary.favorites;
  return {
    options,
    currentOptions: options,
    compareOptions,
    leaderboardOptions,
    currentOption,
    compareOption,
    currentLabel: currentOption?.label || '',
    previousLabel: compareOption?.label || '',
    comparisonMode,
    rows,
    currentRows,
    previousRows,
    currentSummary,
    previousSummary,
    ordersDelta,
    ordersDeltaPct: previousSummary.orders > 0 ? ordersDelta / previousSummary.orders : null,
    viewsDelta,
    viewsDeltaPct: previousSummary.views > 0 ? viewsDelta / previousSummary.views : null,
    cartsDelta,
    favoritesDelta,
    growingRows: rows.filter((row) => row.ordersDelta > 0).length,
    fallingRows: rows.filter((row) => row.ordersDelta < 0).length,
    flatRows: rows.filter((row) => row.ordersDelta === 0).length,
    matchedRows: rows.filter((row) => row.status === 'matched').length,
    newRows: rows.filter((row) => row.status === 'new').length,
    lostRows: rows.filter((row) => row.status === 'lost').length,
    hasComparison: Boolean(currentOption && compareOption)
  };
}

function productLeaderboardLikeForLikeModel(payload = {}, items = []) {
  const previous = productLeaderboardPreviousComparableSnapshot(payload);
  const previousPayload = previous?.snapshot || null;
  const previousItems = Array.isArray(previousPayload?.items) ? previousPayload.items : [];
  const previousMap = new Map(previousItems.map((item) => [productLeaderboardItemCompareKey(item), item]).filter(([key]) => key));
  const rows = (Array.isArray(items) ? items : [])
    .map((current) => {
      const key = productLeaderboardItemCompareKey(current);
      const previousItem = key ? previousMap.get(key) : null;
      if (!previousItem) return null;
      const ordersDelta = numberOrZero(current.orders) - numberOrZero(previousItem.orders);
      const revenueDelta = numberOrZero(current.revenue) - numberOrZero(previousItem.revenue);
      const buysDelta = numberOrZero(current.buys) - numberOrZero(previousItem.buys);
      const clicksDelta = numberOrZero(current.clicks) - numberOrZero(previousItem.clicks);
      const cartsDelta = numberOrZero(current.carts) - numberOrZero(previousItem.carts);
      return {
        key,
        current,
        previous: previousItem,
        ordersDelta,
        ordersDeltaPct: numberOrZero(previousItem.orders) > 0 ? ordersDelta / numberOrZero(previousItem.orders) : null,
        revenueDelta,
        revenueDeltaPct: numberOrZero(previousItem.revenue) > 0 ? revenueDelta / numberOrZero(previousItem.revenue) : null,
        buysDelta,
        clicksDelta,
        cartsDelta
      };
    })
    .filter(Boolean);
  const currentMatched = rows.map((row) => row.current);
  const previousMatched = rows.map((row) => row.previous);
  const currentSummary = productLeaderboardSummaryFromItems(currentMatched);
  const previousSummary = productLeaderboardSummaryFromItems(previousMatched);
  const ordersDelta = currentSummary.orders - previousSummary.orders;
  const revenueDelta = currentSummary.revenue - previousSummary.revenue;
  const buysDelta = currentSummary.buys - previousSummary.buys;
  const clicksDelta = currentSummary.clicks - previousSummary.clicks;
  const cartsDelta = currentSummary.carts - previousSummary.carts;
  const sortedRows = rows.slice().sort((left, right) => (
    numberOrZero(right.ordersDelta) - numberOrZero(left.ordersDelta)
    || numberOrZero(right.revenueDelta) - numberOrZero(left.revenueDelta)
    || String(left.current.articleKey || '').localeCompare(String(right.current.articleKey || ''), 'ru')
  ));
  const currentKeys = new Set((Array.isArray(items) ? items : []).map(productLeaderboardItemCompareKey).filter(Boolean));
  const previousKeys = new Set(previousItems.map(productLeaderboardItemCompareKey).filter(Boolean));
  return {
    previousPayload,
    previousLabel: previousPayload ? (previousPayload.weekLabel || previousPayload.sourceSheetName || 'прошлая неделя') : '',
    rows: sortedRows,
    currentSummary,
    previousSummary,
    ordersDelta,
    ordersDeltaPct: previousSummary.orders > 0 ? ordersDelta / previousSummary.orders : null,
    revenueDelta,
    revenueDeltaPct: previousSummary.revenue > 0 ? revenueDelta / previousSummary.revenue : null,
    buysDelta,
    clicksDelta,
    cartsDelta,
    growingRows: rows.filter((row) => row.ordersDelta > 0).length,
    fallingRows: rows.filter((row) => row.ordersDelta < 0).length,
    flatRows: rows.filter((row) => row.ordersDelta === 0).length,
    newRows: [...currentKeys].filter((key) => !previousKeys.has(key)).length,
    lostRows: [...previousKeys].filter((key) => !currentKeys.has(key)).length
  };
}

function productLeaderboardWeekRange(payload = {}) {
  const label = String(payload.weekLabel || payload.sourceSheetName || '').trim();
  const match = label.match(/(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return { fromLabel: '', toLabel: '', fromIso: '', toIso: '' };
  const fromLabel = `${match[1]}.${match[2]}.${match[3]}`;
  const toLabel = `${match[4]}.${match[5]}.${match[6]}`;
  return {
    fromLabel,
    toLabel,
    fromIso: `${match[3]}-${match[2]}-${match[1]}`,
    toIso: `${match[6]}-${match[5]}-${match[4]}`
  };
}

function productLeaderboardDateRangeCardHtml(range = {}, sourceLabel = '', filters = {}, snapshots = []) {
  const options = productLeaderboardSnapshotSelectOptions(snapshots).map((option) => {
    return `<option value="${escapeHtml(option.key)}" ${String(filters.snapshot || 'latest') === option.key ? 'selected' : ''}>${escapeHtml(option.label)}</option>`;
  }).join('');
  return `
    <div class="product-leaderboard-date-card">
      <span>Период отчета</span>
      <label class="product-leaderboard-date-card__select">
        <em>неделя</em>
        <select data-product-leaderboard-snapshot aria-label="Выбрать неделю продуктового лидерборда">
          ${options || '<option value="latest">Текущий срез</option>'}
        </select>
      </label>
      <b>${escapeHtml(range.fromLabel && range.toLabel ? `${range.fromLabel} - ${range.toLabel}` : 'текущий срез')}</b>
      ${sourceLabel ? `<small>подменники: ${escapeHtml(sourceLabel)}</small>` : ''}
    </div>
  `;
}

function productLeaderboardOrderMiniCardHtml(config = {}) {
  const style = typeof skuPlanFactCardStyle === 'function'
    ? skuPlanFactCardStyle(config.platform || 'wb', config.completion)
    : '';
  const level = typeof skuPlanFactCompletionLevel === 'function'
    ? skuPlanFactCompletionLevel(config.completion)
    : productLeaderboardScoreLevel((Number(config.completion) || 0) * 100);
  return `
    <div class="sku-plan-platform-card product-leaderboard-order-mini level-${level}" style="${style};cursor:default">
      <span class="sku-plan-platform-card__top">
        <strong>${escapeHtml(config.title || '')}</strong>
        <em>${escapeHtml(config.kicker || '')}</em>
      </span>
      <span class="sku-plan-platform-card__value">${escapeHtml(config.value || '')}</span>
      <span class="sku-plan-platform-card__meta">${escapeHtml(config.meta || '')}</span>
      <span class="sku-plan-platform-card__bar"><i></i></span>
      <span class="sku-plan-platform-card__foot">
        <b>${escapeHtml(config.footer || '')}</b>
        <em>${escapeHtml(config.hint || '')}</em>
      </span>
    </div>
  `;
}

function productLeaderboardCommonSplitCardHtml(contour = {}) {
  const kzPct = contour.kzShare == null ? 0 : Math.min(100, Math.max(0, contour.kzShare * 100));
  const organicPct = contour.organicShare == null ? 0 : Math.min(100, Math.max(0, contour.organicShare * 100));
  return `
    <div class="product-leaderboard-order-hero" aria-label="КЗ-лист и остальные WB-подменники в заказах">
      <div class="product-leaderboard-order-hero__top">
        <div>
          <span>всего заказов WB-подменников</span>
          <strong>${fmt.int(contour.totalOrders)}</strong>
          <em>знаменатель из ANS-среза</em>
        </div>
        <div class="product-leaderboard-order-hero__ratio">
          <b>${contour.kzShare == null ? '—' : fmt.pct(contour.kzShare)}</b>
          <em>КЗ-лист / WB</em>
        </div>
      </div>
      <div class="product-leaderboard-order-hero__split">
        <div class="product-leaderboard-order-metric is-kz">
          <span>КЗ-лист</span>
          <strong>${fmt.int(contour.kzOrders)}</strong>
          <em>${contour.kzShare == null ? '—' : fmt.pct(contour.kzShare)} от WB-подменников</em>
        </div>
        <div class="product-leaderboard-order-metric is-organic">
          <span>Остальные WB-подменники</span>
          <strong>${fmt.int(contour.organicOrders)}</strong>
          <em>${contour.organicShare == null ? '—' : fmt.pct(contour.organicShare)} не в КЗ-листе</em>
        </div>
      </div>
      <div class="product-leaderboard-order-track" title="${escapeHtml(`КЗ-лист ${kzPct.toFixed(1)}%, остальные WB-подменники ${organicPct.toFixed(1)}%`)}">
        <i class="is-kz" style="width:${kzPct.toFixed(1)}%"></i>
        <i class="is-organic" style="width:${organicPct.toFixed(1)}%"></i>
      </div>
      <div class="product-leaderboard-order-hero__foot">
        <b>КЗ-лист ${fmt.int(contour.kzOrders)}</b>
        <em>остальные ${fmt.int(contour.organicOrders)} · ${organicPct.toFixed(1)}%</em>
      </div>
    </div>
  `;
}

function renderProductLeaderboardCommonContourHtml(payload = {}, summary = {}, items = [], filters = {}, snapshots = []) {
  const orderContour = productLeaderboardCommonOrderContour(summary, items, filters);
  return renderProductLeaderboardWeeklyTrendHtml(orderContour, payload, filters);
}

function productLeaderboardHasActiveFilters(filters = {}) {
  return Boolean(
    String(filters.search || '').trim()
    || (filters.owner && filters.owner !== 'all')
    || (filters.category && filters.category !== 'all')
    || (filters.signal && filters.signal !== 'all')
  );
}

function productLeaderboardSubstitutionRowsForItems(items = [], filters = {}) {
  const payload = wbSubstitutionTrafficPayload();
  const articles = Array.isArray(payload.articles) ? payload.articles : [];
  const hasActiveFilter = productLeaderboardHasActiveFilters(filters);
  const visibleKeys = new Set((Array.isArray(items) ? items : [])
    .flatMap((item) => productLeaderboardItemSubstitutionKeys(item))
    .filter(Boolean));
  const filteredByLeaderboard = visibleKeys.size > 0
    ? articles.filter((row) => productLeaderboardItemSubstitutionKeys(row).some((key) => visibleKeys.has(key)))
    : articles;
  const rows = filteredByLeaderboard.length ? filteredByLeaderboard : articles;
  return {
    payload,
    articles,
    rows,
    hasActiveFilter,
    isFiltered: visibleKeys.size > 0 && rows.length !== articles.length
  };
}

function productLeaderboardInsightTileHtml(config = {}) {
  const completion = config.completion;
  const level = typeof skuPlanFactCompletionLevel === 'function'
    ? skuPlanFactCompletionLevel(completion)
    : productLeaderboardScoreLevel((Number(completion) || 0) * 100);
  const style = typeof skuPlanFactCardStyle === 'function' ? skuPlanFactCardStyle('wb', completion) : '';
  const actionText = config.active ? 'Сейчас открыт' : (config.actionLabel || 'Показать');
  const actionHint = config.active ? 'Рабочая подложка ниже' : (config.actionHint || 'Переключить подложку');
  const reliefStyle = [
    'width:100%',
    'min-height:124px',
    'text-align:left',
    `border:${config.active ? '2px solid rgba(255,214,130,.92)' : '1px solid rgba(255,214,130,.42)'}`,
    `box-shadow:${config.active ? '0 0 0 2px rgba(255,214,130,.28), 0 20px 48px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.16)' : '0 14px 34px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.12)'}`,
    `transform:translateY(${config.active ? '-2px' : '0'})`,
    'cursor:pointer',
    'font:inherit',
    'color:inherit',
    'appearance:none',
    'transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease'
  ].join(';');
  return `
    <button
      type="button"
      class="sku-plan-platform-card product-leaderboard-insight-tile level-${level}${config.active ? ' is-active' : ''}"
      data-product-leaderboard-panel="${escapeHtml(config.panel || '')}"
      style="${style};${reliefStyle}"
      aria-expanded="${config.active ? 'true' : 'false'}"
    >
      <span class="sku-plan-platform-card__top" style="align-items:flex-start;gap:10px">
        <span style="display:flex;flex-direction:column;gap:4px">
          <strong>${escapeHtml(config.title || '')}</strong>
          <em>${escapeHtml(config.kicker || '')}</em>
        </span>
        <span
          class="quick-chip ${config.active ? 'portal-action-primary' : ''}"
          style="margin-left:auto;pointer-events:none;box-shadow:0 8px 18px rgba(0,0,0,.28);border-color:${config.active ? 'rgba(255,214,130,.86)' : 'rgba(255,214,130,.45)'}"
        >${escapeHtml(actionText)}</span>
      </span>
      <span class="sku-plan-platform-card__value">${escapeHtml(config.value || '')}</span>
      <span class="sku-plan-platform-card__meta">${escapeHtml(config.meta || '')}</span>
      <span class="sku-plan-platform-card__bar"><i></i></span>
      <span class="sku-plan-platform-card__foot">
        <b class="${escapeHtml(config.deltaClass || '')}">${escapeHtml(config.footer || '')}</b>
        <span><em>${escapeHtml(actionHint)}</em></span>
      </span>
    </button>
  `;
}

function renderProductLeaderboardInsightTilesHtml(payload = {}, summary = {}, ownerCoverage = 0, items = [], filters = {}) {
  const game = productLeaderboardGameScore(payload, items);
  const substitutionModel = productLeaderboardSubstitutionRowsForItems(items, filters);
  const substitutionSummary = productLeaderboardSubstitutionSummary(substitutionModel.rows);
  const likeForLike = productLeaderboardExternalLikeForLikeModel(filters, items);
  const activePanel = String(filters.expandedPanel || '');
  const lflCurrentRowsCount = Array.isArray(likeForLike.currentRows) ? likeForLike.currentRows.length : 0;
  const lflCurrentOrders = numberOrZero(likeForLike.currentSummary?.orders);
  const substitutionCompletion = substitutionSummary.orderRate
    ? Math.min(1.35, substitutionSummary.orderRate / 0.06)
    : null;
  const lflCompletion = likeForLike.ordersDeltaPct == null
    ? null
    : Math.min(1.35, Math.max(0.05, 1 + likeForLike.ordersDeltaPct));
  const tiles = [
    {
      panel: 'metrics',
      title: 'Метрики КЗ',
      kicker: `${fmt.int(summary.skuCount)} SKU · owner ${fmt.pct(ownerCoverage)}`,
      value: fmt.money(summary.revenue),
      meta: `${fmt.int(summary.orders)} заказов · ${fmt.int(summary.buys)} выкупов`,
      completion: game.score / 100,
      footer: `ROMI ${fmt.pct(summary.romiPct)} · ДРР ${fmt.pct(summary.drrPct)}`,
      active: activePanel === 'metrics',
      actionLabel: 'Показать метрики',
      actionHint: 'Вернуть КЗ-воронку'
    },
    {
      panel: 'substitution',
      title: 'WB подменные артикулы',
      kicker: substitutionModel.isFiltered ? 'по фильтрам лидерборда' : 'все SKU WB',
      value: fmt.int(substitutionSummary.orders),
      meta: `${fmt.int(substitutionSummary.views)} просмотров · CR ${fmt.pct(substitutionSummary.orderRate)}`,
      completion: substitutionCompletion,
      footer: `${fmt.int(substitutionSummary.articles)} SKU · ${fmt.int(substitutionSummary.substitutionCount)} подмен`,
      deltaClass: wbSubstitutionTrafficTone(substitutionSummary.orderRate),
      active: activePanel === 'substitution',
      actionLabel: 'Показать список',
      actionHint: 'Вместо SKU-воронки'
    },
    {
      panel: 'likeforlike',
      title: 'Like for like',
      kicker: likeForLike.previousLabel
        ? `${likeForLike.comparisonMode === 'leaderboard' ? 'КЗ к' : 'внешние к'} ${likeForLike.previousLabel}`
        : (lflCurrentRowsCount ? 'текущий срез подменников' : 'нужен второй срез внешки'),
      value: likeForLike.hasComparison ? productLeaderboardSignedInt(likeForLike.ordersDelta) : (lflCurrentRowsCount ? fmt.int(lflCurrentRowsCount) : '—'),
      meta: likeForLike.hasComparison
        ? `${fmt.int(likeForLike.rows.length)} связок · ${likeForLike.comparisonMode === 'leaderboard' ? 'охваты' : 'просмотры'} ${productLeaderboardSignedInt(likeForLike.viewsDelta)}`
        : (lflCurrentRowsCount ? `${fmt.int(lflCurrentOrders)} заказов · ${fmt.int(likeForLike.options.length)} срез ANS` : `${fmt.int(likeForLike.options.length)} срез · ждём историю`),
      completion: likeForLike.hasComparison ? lflCompletion : null,
      footer: likeForLike.hasComparison
        ? `растут ${fmt.int(likeForLike.growingRows)} · падают ${fmt.int(likeForLike.fallingRows)}`
        : (lflCurrentRowsCount ? 'связки уже ниже · нужна база сравнения' : 'сравнение появится со 2-го среза'),
      deltaClass: likeForLike.ordersDelta >= 0 ? 'ok-text' : 'danger-text',
      active: activePanel === 'likeforlike',
      actionLabel: 'Показать LFL',
      actionHint: likeForLike.comparisonMode === 'leaderboard' ? 'Сравнить КЗ-недели' : 'Сравнить внешку'
    }
  ];
  return `
    <div class="sku-plan-platform-board product-leaderboard-insight-board" style="margin-top:14px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
      ${tiles.map(productLeaderboardInsightTileHtml).join('')}
    </div>
  `;
}

function renderProductLeaderboardMetricsPanel(payload = {}, filteredSummary = {}, ownerCoverage = 0) {
  return `
    <div class="product-leaderboard-metrics-panel" data-product-leaderboard-expanded-panel="metrics">
      <div class="kpi-strip" style="margin-top:14px">
        <div class="mini-kpi"><span>Охваты</span><strong>${fmt.int(filteredSummary.reach)}</strong><span>верх воронки</span></div>
        <div class="mini-kpi"><span>Клики</span><strong>${fmt.int(filteredSummary.clicks)}</strong><span>CTR ${fmt.pct(filteredSummary.ctrPct)}</span></div>
        <div class="mini-kpi"><span>Корзины</span><strong>${fmt.int(filteredSummary.carts)}</strong><span>из кликов ${fmt.pct(filteredSummary.cartRatePct)}</span></div>
        <div class="mini-kpi"><span>Заказы</span><strong>${fmt.int(filteredSummary.orders)}</strong><span>из кликов ${fmt.pct(filteredSummary.orderRatePct)}</span></div>
        <div class="mini-kpi"><span>Выкупы</span><strong>${fmt.int(filteredSummary.buys)}</strong><span>buyout ${fmt.pct(filteredSummary.buyoutPct)}</span></div>
        <div class="mini-kpi"><span>Выручка / доход</span><strong>${fmt.money(filteredSummary.revenue)}</strong><span>${fmt.money(filteredSummary.income)}</span></div>
      </div>

      <div class="card product-leaderboard-insight-panel" style="margin-top:14px">
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
    </div>
  `;
}

function productLeaderboardLikeForLikeDeltaBadge(value, format = 'int') {
  const numeric = numberOrZero(value);
  const text = format === 'money'
    ? productLeaderboardSignedMoney(numeric)
    : productLeaderboardSignedInt(numeric);
  return badge(text, numeric > 0 ? 'ok' : numeric < 0 ? 'danger' : 'info');
}

function productLeaderboardLikeForLikeTone(value) {
  const numeric = numberOrZero(value);
  if (numeric > 0) return 'growth';
  if (numeric < 0) return 'drop';
  return 'flat';
}

function renderProductLeaderboardExternalLikeForLikeControls(model = {}, filters = {}) {
  const currentOptionList = Array.isArray(model.currentOptions) ? model.currentOptions : (Array.isArray(model.options) ? model.options : []);
  const compareOptionList = Array.isArray(model.compareOptions) ? model.compareOptions : (Array.isArray(model.options) ? model.options : []);
  const currentKey = model.currentOption?.key || filters.lflCurrentSnapshot || 'latest';
  const compareKey = model.compareOption?.key || filters.lflCompareSnapshot || '';
  const currentOptions = currentOptionList.map((option) => (
    `<option value="${escapeHtml(option.key)}" ${option.key === currentKey ? 'selected' : ''}>${escapeHtml(option.label)}</option>`
  )).join('');
  const compareOptions = compareOptionList
    .filter((option) => option.key !== currentKey)
    .map((option) => `<option value="${escapeHtml(option.key)}" ${option.key === compareKey ? 'selected' : ''}>${escapeHtml(option.label)}</option>`)
    .join('');
  return `
    <div class="product-leaderboard-lfl-controls">
      <label class="product-leaderboard-date-card__select">
        <em>срез A</em>
        <select data-product-lfl-current aria-label="Выбрать основной срез внешних артикулов">
          ${currentOptions || '<option value="ans:latest">Текущий ANS-срез</option>'}
        </select>
      </label>
      <label class="product-leaderboard-date-card__select">
        <em>сравнить с</em>
        <select data-product-lfl-compare aria-label="Выбрать базовый срез внешних артикулов" ${compareOptions ? '' : 'disabled'}>
          ${compareOptions || '<option value="">Нужен второй ANS или КЗ-срез</option>'}
        </select>
      </label>
    </div>
  `;
}

function productLeaderboardExternalPairText(row = {}) {
  const source = row.sourceArticleLabel || row.sourceArticleKey || 'артикул';
  const substitution = row.substitutionLabel || row.label || 'подменник';
  return `${source} -> ${substitution}`;
}

function productLeaderboardExternalSourceLink(row = {}) {
  const sourceKey = row.sourceArticleKey || '';
  const sourceLabel = row.sourceArticleLabel || sourceKey || 'артикул';
  return sourceKey ? linkToSku(sourceKey, sourceLabel) : escapeHtml(sourceLabel);
}

function renderProductLeaderboardExternalCurrentPairsTable(model = {}) {
  const rows = Array.isArray(model.currentRows) ? model.currentRows : [];
  return `
    <div class="table-wrap product-leaderboard-lfl-table-wrap" style="margin-top:12px">
      <table class="product-leaderboard-likeforlike-table product-leaderboard-external-lfl-table">
        <thead>
          <tr>
            <th>Артикул КЗ -> подменник</th>
            <th>Подменник</th>
            <th>Заказы</th>
            <th>Просмотры</th>
            <th>Корзины</th>
            <th>Избранное</th>
            <th>CR</th>
            <th>Связка</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, index) => `
            <tr class="product-leaderboard-lfl-row is-flat" data-product-likeforlike-row="${escapeHtml(row.key)}">
              <td>
                <div class="product-leaderboard-lfl-sku-head">
                  <span>${index + 1}</span>
                  <strong>${productLeaderboardExternalSourceLink(row)}</strong>
                </div>
                <div class="muted small">${escapeHtml(row.sourceTitle || '')}</div>
              </td>
              <td>
                <strong>${escapeHtml(row.substitutionLabel || row.label || row.key)}</strong>
                <div class="muted small">WB подменник</div>
              </td>
              <td><strong>${fmt.int(row.orders)}</strong><div class="muted small">${fmt.int(row.rowCount)} строк · ${fmt.int(row.campaignCount)} РК</div></td>
              <td>${fmt.int(row.views)}</td>
              <td>${fmt.int(row.carts)}</td>
              <td>${fmt.int(row.favorites)}</td>
              <td>${fmt.pct(row.orderRate)}</td>
              <td>${badge(productLeaderboardExternalPairText(row), 'info')}</td>
            </tr>
          `).join('') || '<tr><td colspan="8"><div class="empty">Нет связок подменников в текущем срезе.</div></td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function renderProductLeaderboardLikeForLikePanel(payload = {}, filteredItems = []) {
  const filters = getProductLeaderboardFilters();
  const model = productLeaderboardExternalLikeForLikeModel(filters, filteredItems);
  const rows = model.rows;
  const controlsHtml = renderProductLeaderboardExternalLikeForLikeControls(model, filters);
  if (!model.hasComparison) {
    const currentPairCount = Array.isArray(model.currentRows) ? model.currentRows.length : 0;
    const currentOrders = numberOrZero(model.currentSummary?.orders);
    const currentViews = numberOrZero(model.currentSummary?.views);
    const currentNoteHtml = currentPairCount
      ? `
        <div class="product-leaderboard-lfl-current-note" style="margin-top:12px;padding:12px;border:1px solid rgba(91,192,190,.28);border-radius:8px;background:rgba(91,192,190,.08)">
          Текущий ANS-срез уже загружен: ${fmt.int(currentPairCount)} связок, ${fmt.int(currentOrders)} заказов, ${fmt.int(currentViews)} просмотров. Для сравнения нужен второй ANS-срез или недельный КЗ-срез из истории продуктового лидерборда.
        </div>
      `
      : '<div class="empty" style="margin-top:12px">В текущем ANS-срезе нет связок подменников по артикулам.</div>';
    return `
      <div class="card product-leaderboard-likeforlike-panel lfl-flat" data-product-leaderboard-expanded-panel="likeforlike" style="margin-top:14px;--lfl-hue:212;--lfl-bright:.42;--lfl-growth:0%;--lfl-drop:0%">
        <div class="section-subhead">
          <div>
            <h3>Like for like: подменники по артикулам</h3>
            <p class="small muted">Сравнение строится по связке наш артикул -> WB-подменник. Сейчас доступен ${fmt.int(model.options.length)} ANS-срез; текущие связки показываем ниже, а базу сравнения берём из второго ANS или недельного КЗ-среза.</p>
          </div>
          <div class="badge-stack">
            ${badge(`${fmt.int(model.currentSummary.articles)} связок`, model.currentSummary.articles ? 'info' : 'warn')}
            ${badge('нет базы сравнения', 'warn')}
          </div>
        </div>
        ${controlsHtml}
        ${currentNoteHtml}
        ${renderProductLeaderboardExternalCurrentPairsTable(model)}
      </div>
    `;
  }
  const currentLabel = model.currentLabel || 'текущий срез';
  const previousLabel = model.previousLabel || 'базовый срез';
  const isLeaderboardComparison = model.comparisonMode === 'leaderboard';
  const lflTone = productLeaderboardLikeForLikeTone(model.ordersDelta);
  const growthShare = rows.length ? model.growingRows / rows.length : 0;
  const dropShare = rows.length ? model.fallingRows / rows.length : 0;
  const topGrowth = rows.find((row) => row.ordersDelta > 0) || null;
  const topDrop = rows.slice().reverse().find((row) => row.ordersDelta < 0) || null;
  const heroCompletion = model.ordersDeltaPct == null ? 0 : Math.min(1.35, Math.max(0.05, 1 + model.ordersDeltaPct));
  const heroHue = lflTone === 'drop' ? 5 : lflTone === 'growth' ? 145 : 212;
  const heroBright = Math.min(1, Math.max(0.3, heroCompletion / 1.25));
  return `
    <div class="card product-leaderboard-likeforlike-panel lfl-${lflTone}" data-product-leaderboard-expanded-panel="likeforlike" style="margin-top:14px;--lfl-hue:${heroHue};--lfl-bright:${heroBright.toFixed(2)};--lfl-growth:${(growthShare * 100).toFixed(1)}%;--lfl-drop:${(dropShare * 100).toFixed(1)}%">
      <div class="section-subhead">
        <div>
          <h3>Like for like: подменники по артикулам</h3>
          <p class="small muted">${isLeaderboardComparison
            ? `Сравниваем недельные КЗ-срезы по нашему артикулу: текущие ANS-связки показывают подменник, база сравнения — ${escapeHtml(previousLabel)}.`
            : `Сравниваем выбранные ANS-срезы по связке наш артикул -> WB-подменник: ${escapeHtml(currentLabel)} против ${escapeHtml(previousLabel)}.`}</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(model.matchedRows)} ${isLeaderboardComparison ? 'связок с базой' : 'LFL связок'}`, model.matchedRows ? 'info' : 'warn')}
          ${badge(`${fmt.int(model.newRows)} новых`, model.newRows ? 'warn' : 'ok')}
          ${badge(`${fmt.int(model.lostRows)} выпали`, model.lostRows ? 'warn' : 'ok')}
        </div>
      </div>
      ${controlsHtml}
      <div class="product-leaderboard-lfl-hero">
        <div class="product-leaderboard-lfl-score">
          <span>${isLeaderboardComparison ? 'баланс заказов КЗ' : 'баланс заказов внешки'}</span>
          <strong>${escapeHtml(productLeaderboardSignedInt(model.ordersDelta))}</strong>
          <em>${model.ordersDeltaPct == null ? 'без базы процента' : `${escapeHtml(productLeaderboardSignedPct(model.ordersDeltaPct))} к базовому срезу`}</em>
          <div class="product-leaderboard-lfl-track" aria-label="Доля растущих и падающих внешних артикулов">
            <i class="is-growth"></i>
            <i class="is-drop"></i>
          </div>
          <div class="product-leaderboard-lfl-score__foot">
            <b>растут ${fmt.int(model.growingRows)}</b>
            <em>падают ${fmt.int(model.fallingRows)} · ровно ${fmt.int(model.flatRows)}</em>
          </div>
        </div>
        <div class="product-leaderboard-lfl-driver is-growth">
          <span>${isLeaderboardComparison ? 'главный рост КЗ' : 'главный рост внешки'}</span>
          <strong>${topGrowth ? escapeHtml(productLeaderboardExternalPairText(topGrowth.current)) : 'нет роста'}</strong>
          <em>${topGrowth ? `${productLeaderboardSignedInt(topGrowth.ordersDelta)} заказов · ${isLeaderboardComparison ? 'охваты' : 'просмотры'} ${productLeaderboardSignedInt(topGrowth.viewsDelta)}` : (isLeaderboardComparison ? 'по КЗ-артикулам' : 'по внешним артикулам')}</em>
        </div>
        <div class="product-leaderboard-lfl-driver is-drop">
          <span>главная просадка</span>
          <strong>${topDrop ? escapeHtml(productLeaderboardExternalPairText(topDrop.current.label ? topDrop.current : topDrop.previous)) : 'нет просадки'}</strong>
          <em>${topDrop ? `${productLeaderboardSignedInt(topDrop.ordersDelta)} заказов · ${isLeaderboardComparison ? 'охваты' : 'просмотры'} ${productLeaderboardSignedInt(topDrop.viewsDelta)}` : (isLeaderboardComparison ? 'по КЗ-артикулам' : 'по внешним артикулам')}</em>
        </div>
      </div>
      <div class="sku-plan-platform-board product-leaderboard-module-board" style="margin-top:12px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
        ${productLeaderboardModuleCardHtml({
          title: isLeaderboardComparison ? 'Заказы КЗ' : 'Заказы внешки',
          kicker: `${fmt.int(model.currentSummary.orders)} сейчас`,
          value: productLeaderboardSignedInt(model.ordersDelta),
          meta: `${fmt.int(model.previousSummary.orders)} было · ${model.ordersDeltaPct == null ? '—' : productLeaderboardSignedPct(model.ordersDeltaPct)}`,
          completion: model.ordersDeltaPct == null ? null : Math.min(1.35, Math.max(0.05, 1 + model.ordersDeltaPct)),
          footer: `растут ${fmt.int(model.growingRows)}`,
          hint: `падают ${fmt.int(model.fallingRows)}`,
          deltaClass: model.ordersDelta >= 0 ? 'ok' : 'danger'
        })}
        ${productLeaderboardModuleCardHtml({
          title: isLeaderboardComparison ? 'Охваты КЗ' : 'Просмотры внешки',
          kicker: `${fmt.int(model.currentSummary.views)} сейчас`,
          value: productLeaderboardSignedInt(model.viewsDelta),
          meta: `${fmt.int(model.previousSummary.views)} было · ${model.viewsDeltaPct == null ? '—' : productLeaderboardSignedPct(model.viewsDeltaPct)}`,
          completion: model.viewsDeltaPct == null ? null : Math.min(1.35, Math.max(0.05, 1 + model.viewsDeltaPct)),
          footer: 'верх воронки',
          hint: isLeaderboardComparison ? `${fmt.int(model.currentSummary.articles)} SKU` : `${fmt.int(model.currentSummary.articles)} связок`,
          deltaClass: model.viewsDelta >= 0 ? 'ok' : 'danger'
        })}
        ${productLeaderboardModuleCardHtml({
          title: isLeaderboardComparison ? 'Корзины / выкупы' : 'Корзины / избранное',
          kicker: `корзины ${productLeaderboardSignedInt(model.cartsDelta)}`,
          value: productLeaderboardSignedInt(model.favoritesDelta),
          meta: `${fmt.int(model.currentSummary.carts)} корзин · ${fmt.int(model.currentSummary.favorites)} ${isLeaderboardComparison ? 'выкупов' : 'избранное'}`,
          completion: model.previousSummary.carts > 0 ? Math.min(1.35, Math.max(0.05, 1 + model.cartsDelta / model.previousSummary.carts)) : null,
          footer: isLeaderboardComparison ? 'выкупы' : 'избранное',
          hint: isLeaderboardComparison ? 'по КЗ-артикулам' : 'по внешним артикулам',
          deltaClass: model.cartsDelta >= 0 ? 'ok' : 'danger'
        })}
      </div>
      <div class="table-wrap product-leaderboard-lfl-table-wrap" style="margin-top:12px">
        <table class="product-leaderboard-likeforlike-table product-leaderboard-external-lfl-table">
          <thead>
            <tr>
              <th>Артикул КЗ</th>
              <th>WB подменник</th>
              <th>${isLeaderboardComparison ? 'Заказы КЗ сейчас' : 'Заказы сейчас'}</th>
              <th>${isLeaderboardComparison ? 'Заказы КЗ было' : 'Заказы было'}</th>
              <th>Δ заказов</th>
              <th>${isLeaderboardComparison ? 'Охваты' : 'Просмотры'}</th>
              <th>Корзины</th>
              <th>${isLeaderboardComparison ? 'Выкупы' : 'Избранное'}</th>
              <th>CR</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row, index) => {
              const current = row.current;
              const previous = row.previous;
              const rowTone = productLeaderboardLikeForLikeTone(row.ordersDelta);
              const statusLabel = row.status === 'new' ? 'новый' : row.status === 'lost' ? 'выпал' : rowTone === 'growth' ? 'рост' : rowTone === 'drop' ? 'просадка' : 'ровно';
              const statusTone = row.status === 'new' ? 'warn' : row.status === 'lost' ? 'danger' : rowTone === 'growth' ? 'ok' : rowTone === 'drop' ? 'danger' : 'info';
              const sourceRow = current.sourceArticleLabel ? current : previous;
              const substitutionRow = current.substitutionLabel ? current : previous;
              const currentPairRows = numberOrZero(current.externalRowCount || current.rowCount || previous.externalRowCount || previous.rowCount);
              const currentPairCampaigns = numberOrZero(current.externalCampaignCount || current.campaignCount || previous.externalCampaignCount || previous.campaignCount);
              const currentOrderMeta = isLeaderboardComparison
                ? 'текущий КЗ-срез'
                : `${fmt.int(current.rowCount)} строк · ${fmt.int(current.campaignCount)} РК`;
              const previousOrderMeta = isLeaderboardComparison
                ? 'базовый КЗ-срез'
                : `${fmt.int(previous.rowCount)} строк · ${fmt.int(previous.campaignCount)} РК`;
              return `
                <tr class="product-leaderboard-lfl-row is-${rowTone}" data-product-likeforlike-row="${escapeHtml(row.key)}">
                  <td>
                    <div class="product-leaderboard-lfl-sku-head">
                      <span>${index + 1}</span>
                      <strong>${productLeaderboardExternalSourceLink(sourceRow)}</strong>
                    </div>
                    <div class="muted small">${escapeHtml(sourceRow.sourceTitle || '')}</div>
                    <div class="badge-stack" style="margin-top:8px">
                      ${badge(statusLabel, statusTone)}
                      ${badge(productLeaderboardExternalPairText(substitutionRow), 'info')}
                      ${row.ordersDeltaPct == null ? '' : badge(productLeaderboardSignedPct(row.ordersDeltaPct), row.ordersDelta >= 0 ? 'ok' : 'danger')}
                    </div>
                  </td>
                  <td>
                    <strong>${escapeHtml(substitutionRow.substitutionLabel || substitutionRow.label || row.key)}</strong>
                    <div class="muted small">подменник для ${escapeHtml(sourceRow.sourceArticleLabel || sourceRow.sourceArticleKey || 'артикула')}</div>
                    <div class="badge-stack" style="margin-top:8px">
                      ${badge(`${fmt.int(currentPairRows)} строк ANS`, 'info')}
                      ${badge(`${fmt.int(currentPairCampaigns)} РК`, 'info')}
                    </div>
                  </td>
                  <td><strong>${fmt.int(current.orders)}</strong><div class="muted small">${escapeHtml(currentOrderMeta)}</div></td>
                  <td>${fmt.int(previous.orders)}<div class="muted small">${escapeHtml(previousOrderMeta)}</div></td>
                  <td class="product-leaderboard-lfl-delta">${productLeaderboardLikeForLikeDeltaBadge(row.ordersDelta)}</td>
                  <td>${fmt.int(current.views)}<div class="muted small">${productLeaderboardSignedInt(row.viewsDelta)}</div></td>
                  <td>${fmt.int(current.carts)}<div class="muted small">${productLeaderboardSignedInt(row.cartsDelta)}</div></td>
                  <td>${fmt.int(current.favorites)}<div class="muted small">${productLeaderboardSignedInt(row.favoritesDelta)}</div></td>
                  <td>${fmt.pct(current.orderRate)}<div class="muted small">${row.orderRateDelta == null ? '—' : productLeaderboardSignedPct(row.orderRateDelta)}</div></td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="9"><div class="empty">Нет связок подменников для Like for like.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function productLeaderboardOwnerRaceHtml(items = []) {
  const rows = [...items.reduce((map, item) => {
    const owner = item.owner || 'Без owner';
    const current = map.get(owner) || { owner, skuCount: 0, buys: 0, orders: 0, revenue: 0, income: 0, alerts: 0 };
    current.skuCount += 1;
    current.buys += numberOrZero(item.buys);
    current.orders += numberOrZero(item.orders);
    current.revenue += numberOrZero(item.revenue);
    current.income += numberOrZero(item.income);
    current.alerts += numberOrZero(item.diagnostics?.alertCount);
    map.set(owner, current);
    return map;
  }, new Map()).values()]
    .sort((left, right) => right.income - left.income || right.buys - left.buys || left.owner.localeCompare(right.owner, 'ru'))
    .slice(0, 6);
  const maxIncome = Math.max(1, ...rows.map((row) => row.income));
  return `
    <div class="card product-leaderboard-race" style="margin-top:14px">
      <div class="section-subhead">
        <div><h3>Ответственные</h3><p class="small muted">Кто держит КЗ по доходу, выкупам и чистоте сигналов.</p></div>
        ${badge(`${fmt.int(rows.length)} owner`, rows.length ? 'info' : 'warn')}
      </div>
      <div class="list" style="margin-top:12px">
        ${rows.map((row, index) => {
          const completion = row.income / maxIncome;
          return `
            <div class="list-item" style="${typeof skuPlanFactCardStyle === 'function' ? skuPlanFactCardStyle('wb', completion) : ''}">
              <div class="head">
                <div>
                  <strong>${index + 1}. ${escapeHtml(row.owner)}</strong>
                  <div class="muted small">${fmt.int(row.skuCount)} SKU · ${fmt.int(row.buys)} выкупов · ${fmt.int(row.orders)} заказов</div>
                </div>
                <div class="badge-stack">
                  ${badge(fmt.money(row.income), row.income > 0 ? 'ok' : 'warn')}
                  ${row.alerts ? badge(`${fmt.int(row.alerts)} сигналов`, 'warn') : badge('чисто', 'ok')}
                </div>
              </div>
              <span class="sku-health__bar" style="margin-top:10px"><i style="width:${Math.min(100, completion * 100).toFixed(1)}%"></i><em>${fmt.money(row.revenue)}</em></span>
            </div>
          `;
        }).join('') || '<div class="empty">Нет owner в текущем срезе.</div>'}
      </div>
    </div>
  `;
}

function productLeaderboardSubstitutionSummary(rows = []) {
  const summary = {
    articles: rows.length,
    rowCount: 0,
    substitutionCount: 0,
    campaignCount: 0,
    views: 0,
    carts: 0,
    orders: 0,
    favorites: 0
  };
  rows.forEach((row) => {
    summary.rowCount += numberOrZero(row.rowCount);
    summary.substitutionCount += numberOrZero(row.substitutionCount);
    summary.campaignCount += numberOrZero(row.campaignCount);
    summary.views += numberOrZero(row.views);
    summary.carts += numberOrZero(row.carts);
    summary.orders += numberOrZero(row.orders);
    summary.favorites += numberOrZero(row.favorites);
  });
  summary.cartRate = summary.views > 0 ? summary.carts / summary.views : 0;
  summary.orderRate = summary.views > 0 ? summary.orders / summary.views : 0;
  return summary;
}

function productLeaderboardSubstitutionScore(row = {}, maxOrders = 1, maxViews = 1) {
  const orderShare = maxOrders > 0 ? numberOrZero(row.orders) / maxOrders : 0;
  const viewShare = maxViews > 0 ? numberOrZero(row.views) / maxViews : 0;
  const orderRateScore = Math.min(1, numberOrZero(row.orderRate) / 0.08);
  const cartRateScore = Math.min(1, numberOrZero(row.cartRate) / 0.35);
  const score = Math.max(1, Math.min(100, Math.round(
    orderShare * 44
    + viewShare * 22
    + orderRateScore * 22
    + cartRateScore * 12
  )));
  return {
    score,
    level: productLeaderboardScoreLevel(score),
    tone: productLeaderboardScoreTone(score),
    label: score >= 82 ? 'тянет заказы' : score >= 58 ? 'держит трафик' : score >= 36 ? 'нужен фокус' : 'разобрать'
  };
}

function productLeaderboardSubstitutionKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function productLeaderboardSubstitutionArticleKey(row = {}) {
  return productLeaderboardSubstitutionKey(row.articleKey || row.article || row.sellerArticle || row.vendorCode || '');
}

function renderProductLeaderboardSubstitutionRacePanel(items = [], leaderboardPayload = {}, filters = {}) {
  const model = productLeaderboardSubstitutionRowsForItems(items, filters);
  const payload = model.payload;
  const articles = model.articles;
  if (!articles.length) return '';

  const raceRows = model.rows
    .slice()
    .sort((left, right) => (
      numberOrZero(right.orders) - numberOrZero(left.orders)
      || numberOrZero(right.views) - numberOrZero(left.views)
      || String(left.articleKey || '').localeCompare(String(right.articleKey || ''), 'ru')
    ));
  const summary = productLeaderboardSubstitutionSummary(raceRows);
  const maxOrders = Math.max(1, ...raceRows.map((row) => numberOrZero(row.orders)));
  const maxViews = Math.max(1, ...raceRows.map((row) => numberOrZero(row.views)));
  const sourceLabel = payload.asOfDate || payload.source?.sourceGeneratedAt || payload.generatedAt || '';
  const isFiltered = model.isFiltered;
  const orderTone = wbSubstitutionTrafficTone(summary.orderRate);
  const cards = [
    {
      title: 'Просмотры',
      kicker: `${fmt.int(summary.substitutionCount)} подмен`,
      value: fmt.int(summary.views),
      meta: `${fmt.int(summary.articles)} SKU в списке`,
      completion: Math.min(1.35, summary.views / Math.max(1, numberOrZero(payload.summary?.views))),
      footer: isFiltered ? 'по текущему фильтру' : 'общий срез',
      hint: 'просмотры'
    },
    {
      title: 'Заказы',
      kicker: `CR ${fmt.pct(summary.orderRate)}`,
      value: fmt.int(summary.orders),
      meta: `${fmt.int(summary.orders)} / ${fmt.int(summary.views)}`,
      completion: Math.min(1.35, summary.orderRate / 0.06),
      footer: summary.orderRate >= 0.05 ? 'масштабировать' : summary.orderRate >= 0.03 ? 'дожать связку' : 'разобрать',
      hint: 'просмотр в заказ',
      deltaClass: orderTone
    },
    {
      title: 'Корзина',
      kicker: `CR ${fmt.pct(summary.cartRate)}`,
      value: fmt.int(summary.carts),
      meta: `${fmt.int(summary.carts)} корзин`,
      completion: Math.min(1.35, summary.cartRate / 0.32),
      footer: summary.cartRate >= 0.3 ? 'связка живая' : 'проверить карточку',
      hint: 'просмотр в корзину'
    },
    {
      title: 'Список',
      kicker: `${fmt.int(payload.summary?.unmatchedRowCount || 0)} без SKU`,
      value: fmt.int(summary.rowCount),
      meta: `${fmt.int(payload.summary?.mappedRowCount || 0)} строк сматчено`,
      completion: numberOrZero(payload.summary?.rowCount) ? numberOrZero(payload.summary?.mappedRowCount) / numberOrZero(payload.summary?.rowCount) : 1,
      footer: numberOrZero(payload.summary?.unmatchedRowCount) ? 'дочистить alias' : 'контур закрыт',
      hint: 'строки отчета'
    }
  ];

  return `
    <div class="card product-leaderboard-substitution-race product-leaderboard-substitution-workbench" data-product-leaderboard-expanded-panel="substitution" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>WB подменные артикулы</h3>
          <p class="small muted">Полный рабочий список вместо SKU-воронки: по каждому товару видно просмотры, корзины, заказы, CR, избранное и какие подменники дают вклад.</p>
        </div>
        <div class="badge-stack">
          ${badge(sourceLabel ? `срез ${escapeHtml(sourceLabel)}` : 'срез WB', sourceLabel ? 'ok' : 'warn')}
          ${badge(isFiltered ? 'по фильтру лидерборда' : 'все SKU WB', isFiltered ? 'info' : 'ok')}
          ${badge(`${fmt.int(summary.articles)} SKU`, summary.articles ? 'info' : 'warn')}
          ${badge(`CR ${fmt.pct(summary.orderRate)}`, orderTone)}
        </div>
      </div>
      <div class="sku-plan-platform-board product-leaderboard-module-board" style="margin-top:12px">
        ${cards.map(productLeaderboardModuleCardHtml).join('')}
      </div>
      <div class="table-wrap" style="margin-top:12px">
        <table>
          <thead>
            <tr>
              <th>SKU / товар</th>
              <th>Сигнал</th>
              <th>Подмены</th>
              <th>Просмотры</th>
              <th>Корзины</th>
              <th>Заказы</th>
              <th>CR корзина</th>
              <th>CR заказ</th>
              <th>Избранное</th>
              <th>Кампании</th>
              <th>Топ подменники</th>
            </tr>
          </thead>
          <tbody>
            ${raceRows.map((row, index) => {
              const score = productLeaderboardSubstitutionScore(row, maxOrders, maxViews);
              const articleTitle = row.article || row.sellerArticle || row.articleKey || 'WB';
              const articleHtml = row.matched && row.articleKey ? linkToSku(row.articleKey, articleTitle) : `<strong>${escapeHtml(articleTitle)}</strong>`;
              const topSubstitutions = Array.isArray(row.topSubstitutions) ? row.topSubstitutions.slice(0, 5) : [];
              return `
                <tr data-product-substitution-row="${escapeHtml(row.articleKey || row.article || row.sellerArticle || index)}">
                  <td>
                    <div><strong>${index + 1}. ${articleHtml}</strong></div>
                    <div class="muted small">${escapeHtml(row.title || row.name || '')}</div>
                    <div class="badge-stack" style="margin-top:8px">
                      ${row.owner ? badge(row.owner, 'info') : badge('owner не указан', 'warn')}
                      ${row.productId ? badge(`WB nm ${escapeHtml(row.productId)}`, '') : ''}
                      ${row.matched ? badge('есть в SKU', 'ok') : badge('нет матчинга', 'warn')}
                    </div>
                  </td>
                  <td>${productLeaderboardHealthBarHtml({
                    platform: 'wb',
                    label: 'подмены',
                    valueRatio: score.score / 100,
                    valueText: fmt.int(score.score),
                    barText: score.label,
                    tone: score.tone,
                    metaHtml: `<b>${escapeHtml(score.label)}</b><em>${fmt.int(row.orders)} заказов</em>`
                  })}</td>
                  <td>${fmt.int(row.substitutionCount)}</td>
                  <td>${fmt.int(row.views)}</td>
                  <td>${fmt.int(row.carts)}</td>
                  <td>${fmt.int(row.orders)}</td>
                  <td>${fmt.pct(row.cartRate)}</td>
                  <td>${fmt.pct(row.orderRate)}</td>
                  <td>${fmt.int(row.favorites)}</td>
                  <td>${fmt.int(row.campaignCount)}</td>
                  <td>
                    <div class="badge-stack">
                      ${topSubstitutions.map((entry) => badge(`${escapeHtml(entry.label || entry.key || '')}: ${fmt.int(entry.orders)} / ${fmt.int(entry.views)}`, wbSubstitutionTrafficTone(entry.orderRate))).join('') || badge('нет трафика', 'warn')}
                    </div>
                  </td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="11"><div class="empty">По текущему фильтру нет WB-подмен.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function productLeaderboardRowGameHtml(item = {}, payload = {}) {
  const score = productLeaderboardItemScore(item, payload);
  const alerts = numberOrZero(item.diagnostics?.alertCount);
  return productLeaderboardHealthBarHtml({
    platform: 'wb',
    label: 'КЗ модуль',
    valueRatio: score.score / 100,
    valueText: fmt.int(score.score),
    barText: score.label,
    tone: score.tone,
    metaHtml: `
      <b>${escapeHtml(score.label)}</b>
      <em>${fmt.int(item.buys)} выкупов</em>
      <em>${alerts ? `${fmt.int(alerts)} сигналов` : 'без критики'}</em>
    `
  });
}

const PORTAL_MARKETPLACE_KEYS_EXTENDED = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'megamarket', 'samokat', 'magnit'];
const PORTAL_MARKETPLACE_CORE_IU_DRR_KEYS = ['wb', 'ozon', 'ya'];

function adsFunnelNormalizePlatformKey(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  const compact = raw.replace(/[\s_.-]+/g, '');
  if (['ga', 'goldapple', 'goldenapple'].includes(compact)) return 'goldapple';
  if (['letu', 'letual', 'letoile'].includes(compact)) return 'letu';
  if (['megamarket', 'sbermegamarket'].includes(compact)) return 'megamarket';
  if (['samokat'].includes(compact)) return 'samokat';
  if (['mm', 'magnit', 'magnitmarket'].includes(compact)) return 'magnit';
  if (!raw) return 'all';
  if (['wb', 'wildberries', 'вб'].includes(raw)) return 'wb';
  if (['ozon', 'озон'].includes(raw)) return 'ozon';
  if (['ya', 'yam', 'yandex', 'yandex_market', 'yandexmarket', 'ya_market', 'ям', 'я.маркет', 'яндекс'].includes(raw)) return 'ya';
  if (['all', 'total', 'overall', 'итого'].includes(raw)) return 'all';
  return raw;
}

function adsFunnelPlatformLabel(platformKey = 'all') {
  const key = adsFunnelNormalizePlatformKey(platformKey);
  if (key !== 'all' && typeof skuPlanFactPlatformLabel === 'function') return skuPlanFactPlatformLabel(key);
  const map = {
    all: 'Все площадки',
    wb: 'WB',
    ozon: 'Ozon',
    ya: 'Я.Маркет'
  };
  return map[key] || key.toUpperCase();
}

function adsFunnelRate(numerator, denominator) {
  const top = numberOrZero(numerator);
  const bottom = numberOrZero(denominator);
  if (bottom <= 0) return null;
  return top / bottom;
}

function adsFunnelLatestDate(items = [], fallback = '') {
  const dates = items
    .map((item) => String(item?.date || item?.day || item?.label || '').slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  if (fallback) dates.push(String(fallback).slice(0, 10));
  return dates.sort().pop() || fallback || '';
}

function normalizeAdsSummaryPayload(payload = {}) {
  const rawPlatforms = Array.isArray(payload.platforms)
    ? payload.platforms
    : Object.values(payload.platforms || {});
  const rawItems = Array.isArray(payload.itemSeries) ? payload.itemSeries : [];
  const platforms = rawPlatforms.map((platform) => {
    const key = adsFunnelNormalizePlatformKey(platform?.platformKey || platform?.platform || platform?.key || platform?.id || platform?.label);
    const series = Array.isArray(platform?.series)
      ? platform.series.map((point) => ({
          dateKey: point?.date || point?.day || point?.label || '',
          dateStamp: parseFreshStamp(point?.date || point?.day || point?.label || ''),
          views: numberOrZero(point?.views ?? point?.adsImpressions ?? point?.shows),
          clicks: numberOrZero(point?.clicks ?? point?.adsClicks),
          spend: numberOrZero(point?.spend ?? point?.adsSpend),
          orders: numberOrZero(point?.orders ?? point?.ordersUnits),
          revenue: numberOrZero(point?.revenue ?? point?.deliveredRevenue ?? point?.ordersRevenue)
        }))
      : [];
    return {
      key,
      label: String(platform?.label || platform?.platformLabel || adsFunnelPlatformLabel(key)).trim(),
      views: numberOrZero(platform?.views),
      clicks: numberOrZero(platform?.clicks),
      spend: numberOrZero(platform?.spend),
      orders: numberOrZero(platform?.orders),
      revenue: numberOrZero(platform?.revenue),
      series
    };
  });
  const itemSeries = rawItems.map((item) => {
    const dateKey = item?.date || item?.day || item?.label || '';
    const platformKey = adsFunnelNormalizePlatformKey(item?.platformKey || item?.platform || item?.channel || item?.market);
    return {
      dateKey,
      dateStamp: parseFreshStamp(dateKey),
      platformKey,
      articleKey: String(item?.articleKey || item?.offer_id || item?.offerId || item?.article || item?.sku || '').trim(),
      article: String(item?.article || item?.articleKey || item?.offer_id || item?.offerId || '').trim(),
      name: String(item?.name || item?.title || item?.productName || item?.articleKey || item?.offer_id || '').trim(),
      owner: String(item?.owner || item?.ownerName || '').trim(),
      views: numberOrZero(item?.views ?? item?.adsImpressions ?? item?.shows),
      clicks: numberOrZero(item?.clicks ?? item?.adsClicks),
      spend: numberOrZero(item?.spend ?? item?.adsSpend),
      orders: numberOrZero(item?.orders ?? item?.ordersUnits),
      revenue: numberOrZero(item?.revenue ?? item?.deliveredRevenue ?? item?.ordersRevenue)
    };
  });
  return {
    generatedAt: payload.generatedAt || '',
    asOfDate: adsFunnelLatestDate(itemSeries, payload.asOfDate || ''),
    note: payload.note || '',
    platforms,
    itemSeries,
    modeledOzonRows: 0
  };
}

function getAdsFunnelFilters() {
  state.adsFunnelFilters = state.adsFunnelFilters || {};
  state.adsFunnelFilters.search = state.adsFunnelFilters.search || '';
  state.adsFunnelFilters.platform = adsFunnelNormalizePlatformKey(state.adsFunnelFilters.platform || 'all');
  if (!PORTAL_MARKETPLACE_KEYS_EXTENDED.includes(state.adsFunnelFilters.platform)) state.adsFunnelFilters.platform = 'wb';
  state.adsFunnelFilters.horizon = String(state.adsFunnelFilters.horizon || '28');
  state.adsFunnelFilters.sort = state.adsFunnelFilters.sort || 'spend';
  state.adsFunnelFilters.sortDir = state.adsFunnelFilters.sortDir === 'asc' ? 'asc' : 'desc';
  return state.adsFunnelFilters;
}

function adsFunnelHorizonDays(value = '28') {
  const key = String(value || '28').trim();
  if (key === '7') return 7;
  if (key === '14') return 14;
  if (key === '28') return 28;
  return null;
}

const ADS_DAILY_METRICS = [
  { key: 'events', label: 'События', formula: 'задачи / изменения', format: 'events', row: 1 },
  { key: 'spend', label: 'Расходы (реклама), ₽', formula: 'реклама', format: 'money', row: 2 },
  { key: 'views', label: 'Показы (реклама), шт', formula: 'реклама', format: 'int', row: 3 },
  { key: 'cpm', label: 'CPM, ₽', formula: 'расход / показы × 1000', format: 'money', row: 4 },
  { key: 'clicks', label: 'Клики, шт', formula: 'воронка', format: 'int', row: 5 },
  { key: 'ctr', label: 'Конверсия в клик (CTR), %', formula: 'клики / показы', format: 'pct', row: 6 },
  { key: 'cpc', label: 'Стоимость клика (CPC), ₽', formula: 'расход / клики', format: 'money', row: 7 },
  { key: 'orders', label: 'Заказы, шт', formula: 'воронка', format: 'int', row: 8 },
  { key: 'cr', label: 'Конверсия в заказ (CR), %', formula: 'заказы / клики', format: 'pct', row: 9 },
  { key: 'cpo', label: 'Стоимость заказа (CPO), ₽', formula: 'расход / заказы', format: 'money', row: 10 },
  { key: 'revenue', label: 'Выручка с рекламы, ₽', formula: 'воронка', format: 'money', row: 11 },
  { key: 'drr', label: 'ДРР, %', formula: 'расход / выручка', format: 'pct', row: 12 },
  { key: 'romi', label: 'ROMI, %', formula: '(выручка - расход) / расход', format: 'pct', row: 13 }
];

function adsFunnelDateKey(value = '') {
  const direct = String(value || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const stamp = parseFreshStamp(value);
  if (!Number.isFinite(stamp) || stamp <= 0) return '';
  const date = new Date(stamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function adsFunnelDateShort(value = '') {
  const key = adsFunnelDateKey(value);
  if (!key) return '—';
  return `${key.slice(8, 10)}.${key.slice(5, 7)}`;
}

function adsFunnelPlatformRgb(key = 'wb') {
  const platformKey = adsFunnelNormalizePlatformKey(key);
  if (platformKey === 'ozon') return [42, 139, 242];
  if (platformKey === 'ya') return [236, 184, 49];
  if (platformKey === 'goldapple') return [91, 188, 114];
  if (platformKey === 'letu') return [219, 106, 169];
  if (platformKey === 'megamarket') return [249, 115, 22];
  if (platformKey === 'samokat') return [16, 185, 129];
  if (platformKey === 'magnit') return [232, 91, 85];
  return [128, 86, 214];
}

function adsFunnelPlatformTone(key = 'wb') {
  const platformKey = adsFunnelNormalizePlatformKey(key);
  if (platformKey === 'ozon') return 'info';
  if (platformKey === 'ya') return 'ok';
  if (['goldapple', 'samokat'].includes(platformKey)) return 'ok';
  if (['letu', 'megamarket', 'magnit'].includes(platformKey)) return 'warn';
  return 'warn';
}

function adsFunnelEmptyPoint(dateKey = '') {
  return { dateKey, views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 };
}

function adsFunnelAddPoint(target, source = {}) {
  target.views += numberOrZero(source.views);
  target.clicks += numberOrZero(source.clicks);
  target.spend += numberOrZero(source.spend);
  target.orders += numberOrZero(source.orders);
  target.revenue += numberOrZero(source.revenue);
  return target;
}

function adsFunnelMetricValue(metricKey, point = {}) {
  if (metricKey === 'views') return point.views;
  if (metricKey === 'clicks') return point.clicks;
  if (metricKey === 'spend') return point.spend;
  if (metricKey === 'orders') return point.orders;
  if (metricKey === 'revenue') return point.revenue;
  if (metricKey === 'cpm') return point.views > 0 ? (point.spend / point.views) * 1000 : null;
  if (metricKey === 'ctr') return adsFunnelRate(point.clicks, point.views);
  if (metricKey === 'cr') return adsFunnelRate(point.orders, point.clicks);
  if (metricKey === 'cpc') return adsFunnelRate(point.spend, point.clicks);
  if (metricKey === 'cpo') return adsFunnelRate(point.spend, point.orders);
  if (metricKey === 'drr') return adsFunnelRate(point.spend, point.revenue);
  if (metricKey === 'romi') return point.spend > 0 ? (point.revenue - point.spend) / point.spend : null;
  return null;
}

function adsFunnelFormatMetric(metric, value) {
  if (metric.format === 'events') return '';
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
  if (metric.format === 'money') return fmt.money(value);
  if (metric.format === 'int') return fmt.int(value);
  if (metric.format === 'pct') return fmt.pct(value);
  return fmt.num(value, 1);
}

function adsFunnelAverageMetric(metric, values = []) {
  const numeric = values.filter((value) => Number.isFinite(Number(value)));
  if (!numeric.length) return null;
  return numeric.reduce((sum, value) => sum + Number(value), 0) / numeric.length;
}

function adsFunnelHeatStyle(metric, value, stats, platformKey) {
  if (metric.format === 'events' || value === null || value === undefined || !Number.isFinite(Number(value))) return '';
  const numeric = Number(value);
  const min = Number.isFinite(stats?.min) ? stats.min : 0;
  const max = Number.isFinite(stats?.max) ? stats.max : 0;
  const spread = Math.max(0.000001, max - min);
  const intensity = max <= min ? (Math.abs(numeric) > 0 ? 0.42 : 0) : Math.max(0, Math.min(1, (numeric - min) / spread));
  const rgb = metric.key === 'romi' && numeric < 0 ? [210, 73, 73] : adsFunnelPlatformRgb(platformKey);
  const alpha = Math.min(0.76, 0.08 + (intensity * 0.58));
  return `--ads-cell-rgb:${rgb.join(',')};--ads-cell-alpha:${alpha.toFixed(3)}`;
}

function adsFunnelSearchHaystack(row = {}) {
  return [
    row.articleKey, row.article, row.name, row.owner, row.campaignName, row.campaignId, row.channel, row.nmId
  ].filter(Boolean).join(' ').toLowerCase();
}

function adsFunnelPlatformMatches(rowPlatform, selectedPlatform) {
  return adsFunnelNormalizePlatformKey(rowPlatform) === adsFunnelNormalizePlatformKey(selectedPlatform);
}

function adsFunnelTaskPlatform(task, fallbackText = '') {
  try {
    if (typeof controlWorkstreamKey === 'function') {
      const key = adsFunnelNormalizePlatformKey(controlWorkstreamKey(task, typeof getSku === 'function' ? getSku(task?.articleKey) : null));
      if (PORTAL_MARKETPLACE_KEYS_EXTENDED.includes(key)) return key;
    }
  } catch {}
  const text = String(fallbackText || '').toLowerCase();
  const compactText = text.replace(/[\s_.-]+/g, '');
  if (/goldapple|goldenapple|золот/.test(compactText)) return 'goldapple';
  if (/letu|letual|letoile|л['’]?этуаль|летуаль/.test(compactText)) return 'letu';
  if (/megamarket|sbermegamarket|мегамаркет/.test(compactText)) return 'megamarket';
  if (/samokat|самокат/.test(compactText)) return 'samokat';
  if (/magnitmarket|magnit|магнит/.test(compactText)) return 'magnit';
  if (/(^|[^a-zа-я0-9])wb(?=$|[^a-zа-я0-9])|wildberries|(^|[^а-я0-9])вб(?=$|[^а-я0-9])/.test(text)) return 'wb';
  if (/ozon|озон/.test(text)) return 'ozon';
  return '';
}

function adsFunnelEventDateKey(item = {}, dateSet = new Set()) {
  const candidates = [item.doneAt, item.completedAt, item.due, item.updatedAt, item.updated_at, item.createdAt, item.created_at, item.date]
    .map(adsFunnelDateKey)
    .filter(Boolean);
  return candidates.find((date) => dateSet.has(date)) || '';
}

function adsFunnelEventLabel(value = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Событие';
  return text.length > 46 ? `${text.slice(0, 43)}...` : text;
}

function adsFunnelCollectEvents(platformKey, dateKeys = [], searchNeedle = '') {
  const dateSet = new Set(dateKeys);
  const eventsByDate = Object.fromEntries(dateKeys.map((date) => [date, []]));
  const needle = String(searchNeedle || '').trim().toLowerCase();
  const eventRe = /слайд|фото|карточ|контент|seo|описан|рк|кампан|ставк|бюдж|реклам|цена|промо|обложк|инфограф/i;
  const pushEvent = (dateKey, label, source = '') => {
    if (!dateKey || !eventsByDate[dateKey]) return;
    const list = eventsByDate[dateKey];
    const cleanLabel = adsFunnelEventLabel(label);
    if (!cleanLabel || list.some((item) => item.label === cleanLabel)) return;
    if (list.length < 4) list.push({ label: cleanLabel, source });
  };

  let tasks = [];
  try {
    tasks = typeof getAllTasks === 'function' ? getAllTasks() : [];
  } catch {
    tasks = [];
  }
  const taskById = new Map();
  tasks.forEach((task) => {
    const text = [
      task?.platform, task?.marketplace, task?.entityLabel, task?.title, task?.nextAction, task?.reason,
      task?.description, task?.articleKey, task?.owner
    ].filter(Boolean).join(' ');
    if (!eventRe.test(text)) return;
    if (needle && !text.toLowerCase().includes(needle)) return;
    if (adsFunnelTaskPlatform(task, text) !== platformKey) return;
    const dateKey = adsFunnelEventDateKey(task, dateSet);
    if (!dateKey) return;
    taskById.set(String(task?.id || ''), task);
    pushEvent(dateKey, task?.title || task?.entityLabel || task?.nextAction || task?.reason || 'Изменение', task?.owner || '');
  });

  const historyItems = Array.isArray(state?.storage?.taskHistory) ? state.storage.taskHistory : [];
  historyItems.forEach((item) => {
    const task = taskById.get(String(item?.taskId || item?.task_id || '')) || null;
    const text = [
      item?.label, item?.message, item?.comment, item?.note, item?.kind,
      task?.platform, task?.entityLabel, task?.title, task?.nextAction, task?.reason, task?.articleKey
    ].filter(Boolean).join(' ');
    if (!eventRe.test(text)) return;
    if (needle && !text.toLowerCase().includes(needle)) return;
    if (adsFunnelTaskPlatform(task || {}, text) !== platformKey) return;
    const dateKey = adsFunnelEventDateKey(item, dateSet);
    pushEvent(dateKey, item?.message || item?.comment || item?.label || task?.title || 'Изменение', item?.kind || '');
  });

  return eventsByDate;
}

function adsFunnelBuildDailyMatrixModel(payload = state.adsSummary || {}) {
  const filters = getAdsFunnelFilters();
  const normalized = normalizeAdsSummaryPayload(payload || {});
  const platformKey = PORTAL_MARKETPLACE_KEYS_EXTENDED.includes(filters.platform) ? filters.platform : 'wb';
  const horizonDays = adsFunnelHorizonDays(filters.horizon);
  const searchNeedle = String(filters.search || '').trim().toLowerCase();
  const platform = normalized.platforms.find((item) => adsFunnelNormalizePlatformKey(item.key) === platformKey) || { series: [] };
  const platformRows = Array.isArray(platform.series) ? platform.series : [];
  const itemRowsForPlatform = normalized.itemSeries.filter((row) => adsFunnelPlatformMatches(row.platformKey, platformKey));
  const allDateKeys = [...new Set([
    ...platformRows.map((point) => adsFunnelDateKey(point.dateKey || point.date || point.label)),
    ...itemRowsForPlatform.map((row) => adsFunnelDateKey(row.dateKey || row.date || row.label))
  ].filter(Boolean))].sort();
  const latestDate = allDateKeys[allDateKeys.length - 1] || adsFunnelDateKey(normalized.asOfDate || normalized.generatedAt);
  const latestStamp = parseFreshStamp(latestDate);
  const minStamp = horizonDays && latestStamp ? latestStamp - ((horizonDays - 1) * 86400000) : 0;
  const dateKeys = allDateKeys.filter((dateKey) => {
    if (!horizonDays || !latestStamp) return true;
    const stamp = parseFreshStamp(dateKey);
    return stamp >= minStamp && stamp <= latestStamp;
  });
  const daily = Object.fromEntries(dateKeys.map((dateKey) => [dateKey, adsFunnelEmptyPoint(dateKey)]));
  let matchedRows = [];
  if (searchNeedle) {
    matchedRows = itemRowsForPlatform.filter((row) => dateKeys.includes(adsFunnelDateKey(row.dateKey)) && adsFunnelSearchHaystack(row).includes(searchNeedle));
    matchedRows.forEach((row) => {
      const dateKey = adsFunnelDateKey(row.dateKey);
      if (daily[dateKey]) adsFunnelAddPoint(daily[dateKey], row);
    });
  } else {
    platformRows.forEach((point) => {
      const dateKey = adsFunnelDateKey(point.dateKey || point.date || point.label);
      if (daily[dateKey]) adsFunnelAddPoint(daily[dateKey], point);
    });
  }
  const points = dateKeys.map((dateKey) => daily[dateKey] || adsFunnelEmptyPoint(dateKey));
  const totals = points.reduce((acc, point) => adsFunnelAddPoint(acc, point), adsFunnelEmptyPoint('total'));
  const eventsByDate = adsFunnelCollectEvents(platformKey, dateKeys, searchNeedle);
  const tableRows = ADS_DAILY_METRICS.map((metric) => {
    if (metric.format === 'events') {
      const eventCounts = dateKeys.map((dateKey) => (eventsByDate[dateKey] || []).length);
      return { metric, values: eventCounts, average: eventCounts.reduce((sum, count) => sum + count, 0), min: 0, max: Math.max(0, ...eventCounts) };
    }
    const values = points.map((point) => adsFunnelMetricValue(metric.key, point));
    const numeric = values.filter((value) => Number.isFinite(Number(value))).map(Number);
    return {
      metric,
      values,
      average: adsFunnelAverageMetric(metric, values),
      min: numeric.length ? Math.min(...numeric) : 0,
      max: numeric.length ? Math.max(...numeric) : 0
    };
  });
  const uniqueSku = new Set(matchedRows.map((row) => row.articleKey || row.article || row.name).filter(Boolean));
  return {
    payload: normalized,
    filters,
    platformKey,
    platformLabel: adsFunnelPlatformLabel(platformKey),
    dateKeys,
    points,
    totals,
    summary: {
      ...totals,
      ctr: adsFunnelMetricValue('ctr', totals),
      cr: adsFunnelMetricValue('cr', totals),
      cpc: adsFunnelMetricValue('cpc', totals),
      cpo: adsFunnelMetricValue('cpo', totals),
      drr: adsFunnelMetricValue('drr', totals),
      romi: adsFunnelMetricValue('romi', totals)
    },
    tableRows,
    eventsByDate,
    eventCount: Object.values(eventsByDate).reduce((sum, list) => sum + list.length, 0),
    searchNeedle,
    matchedRows,
    uniqueSkuCount: uniqueSku.size,
    horizonDays,
    horizonLabel: horizonDays ? `${horizonDays} дней` : 'весь период',
    minDateLabel: dateKeys[0] ? adsFunnelDateShort(dateKeys[0]) : '—',
    maxDateLabel: dateKeys[dateKeys.length - 1] ? adsFunnelDateShort(dateKeys[dateKeys.length - 1]) : '—'
  };
}

function adsFunnelHeatmapExportRows(model) {
  return model.tableRows.map((row) => {
    const result = {
      platform: model.platformLabel,
      metric: row.metric.label,
      formula: row.metric.formula,
      average: row.metric.format === 'events' ? row.average : adsFunnelFormatMetric(row.metric, row.average)
    };
    model.dateKeys.forEach((dateKey, index) => {
      if (row.metric.format === 'events') {
        result[dateKey] = (model.eventsByDate[dateKey] || []).map((event) => event.label).join('; ');
      } else {
        result[dateKey] = adsFunnelFormatMetric(row.metric, row.values[index]);
      }
    });
    return result;
  });
}

function downloadAdsFunnelHeatmapExcel(model) {
  const rows = adsFunnelHeatmapExportRows(model);
  if (!rows.length) {
    window.alert('Нет строк для выгрузки.');
    return;
  }
  downloadLaunchesHtmlTable([
    ['platform', 'Площадка'],
    ['metric', 'Метрика'],
    ['formula', 'Расчет'],
    ['average', 'Среднее / всего'],
    ...model.dateKeys.map((dateKey) => [dateKey, dateKey])
  ], rows, `ads-control-${model.platformKey}-${todayIso()}.xls`);
}

function adsFunnelBuildModel(payload = state.adsSummary || {}) {
  const filters = getAdsFunnelFilters();
  const normalized = normalizeAdsSummaryPayload(payload || {});
  const horizonDays = adsFunnelHorizonDays(filters.horizon);
  const allDateStamps = [
    parseFreshStamp(normalized.asOfDate),
    parseFreshStamp(normalized.generatedAt),
    ...normalized.itemSeries.map((row) => row.dateStamp),
    ...normalized.platforms.flatMap((platform) => platform.series.map((point) => point.dateStamp))
  ].filter((stamp) => Number.isFinite(stamp) && stamp > 0);
  const latestStamp = allDateStamps.length ? Math.max(...allDateStamps) : 0;
  const minStamp = horizonDays && latestStamp ? latestStamp - ((horizonDays - 1) * 86400000) : 0;
  const platformFilter = adsFunnelNormalizePlatformKey(filters.platform || 'all');
  const searchNeedle = String(filters.search || '').trim().toLowerCase();

  const inScopeDate = (stamp) => {
    if (!horizonDays || !latestStamp) return true;
    if (!Number.isFinite(stamp) || stamp <= 0) return false;
    return stamp >= minStamp && stamp <= latestStamp;
  };
  const inScopePlatform = (platformKey) => platformFilter === 'all' || adsFunnelNormalizePlatformKey(platformKey) === platformFilter;

  const filteredSeries = normalized.itemSeries.filter((row) => inScopeDate(row.dateStamp) && inScopePlatform(row.platformKey));
  const grouped = new Map();
  filteredSeries.forEach((row) => {
    const key = row.articleKey || row.article || row.name || `no-sku-${row.platformKey || 'all'}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        articleKey: row.articleKey || row.article || '',
        article: row.article || row.articleKey || '',
        name: row.name || row.article || row.articleKey || 'SKU',
        owner: row.owner || '',
        platforms: new Set(),
        views: 0,
        clicks: 0,
        spend: 0,
        orders: 0,
        revenue: 0
      });
    }
    const bucket = grouped.get(key);
    bucket.platforms.add(adsFunnelNormalizePlatformKey(row.platformKey));
    bucket.views += row.views;
    bucket.clicks += row.clicks;
    bucket.spend += row.spend;
    bucket.orders += row.orders;
    bucket.revenue += row.revenue;
    if (!bucket.owner && row.owner) bucket.owner = row.owner;
    if ((!bucket.article || bucket.article === bucket.articleKey) && row.article) bucket.article = row.article;
    if ((!bucket.name || bucket.name === bucket.article || bucket.name === bucket.articleKey) && row.name) bucket.name = row.name;
  });

  let rows = [...grouped.values()].map((row) => ({
    ...row,
    ctr: adsFunnelRate(row.clicks, row.views),
    cr: adsFunnelRate(row.orders, row.clicks),
    cpc: adsFunnelRate(row.spend, row.clicks),
    cpo: adsFunnelRate(row.spend, row.orders),
    drr: adsFunnelRate(row.spend, row.revenue)
  }));
  if (searchNeedle) {
    rows = rows.filter((row) => {
      const haystack = [
        row.articleKey,
        row.article,
        row.name,
        row.owner,
        ...[...row.platforms].map((platform) => adsFunnelPlatformLabel(platform))
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(searchNeedle);
    });
  }

  const sortKey = filters.sort || 'spend';
  const sortDir = filters.sortDir === 'asc' ? 'asc' : 'desc';
  const directionFactor = sortDir === 'asc' ? 1 : -1;
  const asMetric = (row) => {
    const value = row?.[sortKey];
    if (typeof value === 'string') return value.toLowerCase();
    if (value === null || value === undefined || value === '') return sortDir === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (sortDir === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
  };
  rows.sort((left, right) => {
    const leftMetric = asMetric(left);
    const rightMetric = asMetric(right);
    if (typeof leftMetric === 'string' || typeof rightMetric === 'string') {
      return String(leftMetric).localeCompare(String(rightMetric), 'ru') * directionFactor
        || (right.revenue - left.revenue)
        || (right.orders - left.orders);
    }
    return (leftMetric - rightMetric) * directionFactor
      || (right.revenue - left.revenue)
      || (right.orders - left.orders)
      || left.name.localeCompare(right.name, 'ru');
  });

  const summaryBase = rows.reduce((acc, row) => {
    acc.views += row.views;
    acc.clicks += row.clicks;
    acc.spend += row.spend;
    acc.orders += row.orders;
    acc.revenue += row.revenue;
    return acc;
  }, { views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 });
  const summary = {
    ...summaryBase,
    ctr: adsFunnelRate(summaryBase.clicks, summaryBase.views),
    cr: adsFunnelRate(summaryBase.orders, summaryBase.clicks),
    cpc: adsFunnelRate(summaryBase.spend, summaryBase.clicks),
    cpo: adsFunnelRate(summaryBase.spend, summaryBase.orders),
    drr: adsFunnelRate(summaryBase.spend, summaryBase.revenue)
  };

  const platformKeys = new Set(['all']);
  normalized.platforms.forEach((platform) => platformKeys.add(adsFunnelNormalizePlatformKey(platform.key)));
  normalized.itemSeries.forEach((row) => platformKeys.add(adsFunnelNormalizePlatformKey(row.platformKey)));
  const platformOptions = [...platformKeys].filter(Boolean).map((key) => ({
    key,
    label: adsFunnelPlatformLabel(key)
  }));
  platformOptions.sort((left, right) => {
    if (left.key === 'all') return -1;
    if (right.key === 'all') return 1;
    return left.label.localeCompare(right.label, 'ru');
  });

  const horizonLabel = horizonDays ? `${horizonDays} дней` : 'весь доступный период';
  const minDateLabel = minStamp ? new Date(minStamp).toLocaleDateString('ru-RU') : '—';
  const maxDateLabel = latestStamp ? new Date(latestStamp).toLocaleDateString('ru-RU') : '—';
  return {
    payload: normalized,
    filters,
    rows,
    summary,
    platformOptions,
    platformLabel: adsFunnelPlatformLabel(platformFilter),
    platformFilter,
    horizonDays,
    horizonLabel,
    minDateLabel,
    maxDateLabel,
    latestStamp
  };
}

function adsFunnelExportRows(rows, model) {
  return rows.map((row) => ({
    as_of_date: model.payload.asOfDate || model.payload.generatedAt || '',
    platform_filter: model.platformLabel,
    horizon: model.horizonLabel,
    article_key: row.articleKey || '',
    article: row.article || '',
    name: row.name || '',
    owner: row.owner || '',
    platforms: [...row.platforms].map((key) => adsFunnelPlatformLabel(key)).join(', '),
    views: row.views,
    clicks: row.clicks,
    orders: row.orders,
    spend: row.spend,
    revenue: row.revenue,
    ctr_pct: row.ctr === null ? '' : row.ctr,
    cr_pct: row.cr === null ? '' : row.cr,
    cpc: row.cpc === null ? '' : row.cpc,
    cpo: row.cpo === null ? '' : row.cpo,
    drr_pct: row.drr === null ? '' : row.drr
  }));
}

function downloadAdsFunnelExcel(model) {
  const rows = adsFunnelExportRows(model.rows, model);
  if (!rows.length) {
    window.alert('По текущим фильтрам нет строк для выгрузки.');
    return;
  }
  downloadLaunchesHtmlTable([
    ['as_of_date', 'Дата среза'],
    ['platform_filter', 'Площадка'],
    ['horizon', 'Период'],
    ['article_key', 'Article key'],
    ['article', 'Артикул'],
    ['name', 'Товар'],
    ['owner', 'Owner'],
    ['platforms', 'Площадки'],
    ['views', 'Показы'],
    ['clicks', 'Клики'],
    ['orders', 'Заказы'],
    ['spend', 'Затраты'],
    ['revenue', 'Выручка'],
    ['ctr_pct', 'CTR'],
    ['cr_pct', 'CR'],
    ['cpc', 'CPC'],
    ['cpo', 'CPO'],
    ['drr_pct', 'ДРР']
  ], rows, `ads-funnel-${todayIso()}.xls`);
}

function renderAdsFunnel(rootId = 'view-ads-funnel') {
  const root = document.getElementById(rootId);
  if (!root) return;
  const model = adsFunnelBuildDailyMatrixModel(state.adsSummary || {});
  const rgb = adsFunnelPlatformRgb(model.platformKey);
  const dateRangeLine = model.dateKeys.length
    ? `${escapeHtml(model.minDateLabel)} — ${escapeHtml(model.maxDateLabel)}`
    : 'нет дат';
  const scopeLabel = model.searchNeedle
    ? `${fmt.int(model.uniqueSkuCount)} SKU · ${fmt.int(model.matchedRows.length)} строк`
    : 'вся площадка';
  const platformButtons = PORTAL_MARKETPLACE_KEYS_EXTENDED.map((key) => {
    const active = model.platformKey === key;
    const label = adsFunnelPlatformLabel(key);
    const tone = adsFunnelPlatformTone(key);
    const subLabel = key === 'wb' ? 'Wildberries' : key === 'ozon' ? 'Ozon' : key === 'ya' ? 'Funnel API' : 'extra network';
    const toneLabel = key === 'wb' ? 'фиолетовый контур' : key === 'ozon' ? 'синий контур' : key === 'ya' ? 'воронка API' : 'нет API-факта';
    return `
      <button class="ads-control-platform ${active ? 'active' : ''}" type="button" data-ads-platform="${escapeHtml(key)}" aria-pressed="${active}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(subLabel)}</strong>
        ${badge(toneLabel, tone)}
      </button>`;
  }).join('');
  const renderCell = (row, dateKey, index) => {
    if (row.metric.format === 'events') {
      const events = model.eventsByDate[dateKey] || [];
      return `
        <td class="ads-event-day ${events.length ? 'has-events' : ''}">
          ${events.length
            ? `<div class="ads-event-stack">${events.map((event) => `<span title="${escapeHtml(event.label)}">${escapeHtml(event.label)}</span>`).join('')}</div>`
            : '<span class="muted">—</span>'}
        </td>`;
    }
    const value = row.values[index];
    const style = adsFunnelHeatStyle(row.metric, value, row, model.platformKey);
    const tone = row.metric.key === 'romi' && Number(value) < 0 ? 'is-bad' : '';
    return `<td class="ads-heat-cell ${tone}" style="${style}" title="${escapeHtml(row.metric.label)} · ${escapeHtml(dateKey)}">${adsFunnelFormatMetric(row.metric, value)}</td>`;
  };

  root.dataset.platform = model.platformKey;
  root.style.setProperty('--ads-platform-rgb', rgb.join(','));

  root.innerHTML = `
    <div class="ads-control-shell">
      <div class="section-title">
        <div>
          <h2>Контроль РК</h2>
          <p>Дневная динамика рекламы: расходы, показы, клики, заказы, ДРР и события в одной тепловой таблице.</p>
        </div>
        <div class="badge-stack">
          ${badge(model.payload.asOfDate ? `срез ${model.payload.asOfDate}` : 'без даты среза', model.payload.asOfDate ? 'info' : 'warn')}
          ${badge(`период ${escapeHtml(model.horizonLabel)}`, 'info')}
          ${badge(model.platformLabel, adsFunnelPlatformTone(model.platformKey))}
          ${badge(`событий ${fmt.int(model.eventCount)}`, model.eventCount ? 'warn' : 'ok')}
        </div>
      </div>

      <div class="ads-control-toolbar">
        <div class="ads-control-platforms" role="group" aria-label="Площадка">
          ${platformButtons}
        </div>
        <div class="ads-control-filters">
          <input id="adsFunnelSearch" placeholder="SKU, артикул, кампания или событие" value="${escapeHtml(model.filters.search)}">
          <select id="adsFunnelHorizon">
            <option value="7" ${model.filters.horizon === '7' ? 'selected' : ''}>7 дней</option>
            <option value="14" ${model.filters.horizon === '14' ? 'selected' : ''}>14 дней</option>
            <option value="28" ${model.filters.horizon === '28' ? 'selected' : ''}>28 дней</option>
            <option value="all" ${model.filters.horizon === 'all' ? 'selected' : ''}>Весь период</option>
          </select>
          <button class="quick-chip" type="button" data-ads-refresh>Обновить данные</button>
          <button class="quick-chip portal-action-primary" type="button" data-ads-export>Выгрузить Excel</button>
        </div>
        <div class="ads-control-source">
          <span>Источник: data/ads_summary.json</span>
          <strong>${escapeHtml(dateRangeLine)}</strong>
          <span>${escapeHtml(scopeLabel)}${model.payload.generatedAt ? ` · обновлено ${escapeHtml(fmt.date(model.payload.generatedAt))}` : ''}</span>
        </div>
      </div>

      <div class="ads-control-kpis">
        <div class="mini-kpi"><span>Расход</span><strong>${fmt.money(model.summary.spend)}</strong><span>${escapeHtml(model.platformLabel)}</span></div>
        <div class="mini-kpi"><span>Показы</span><strong>${fmt.int(model.summary.views)}</strong><span>CTR ${fmt.pct(model.summary.ctr)}</span></div>
        <div class="mini-kpi"><span>Клики</span><strong>${fmt.int(model.summary.clicks)}</strong><span>CPC ${model.summary.cpc === null ? '—' : fmt.money(model.summary.cpc)}</span></div>
        <div class="mini-kpi"><span>Заказы</span><strong>${fmt.int(model.summary.orders)}</strong><span>CR ${fmt.pct(model.summary.cr)}</span></div>
        <div class="mini-kpi"><span>ДРР</span><strong>${fmt.pct(model.summary.drr)}</strong><span>ROMI ${fmt.pct(model.summary.romi)}</span></div>
      </div>

      <div class="ads-control-table-card">
        <div class="section-subhead">
          <div>
            <h3>Динамика по дням</h3>
            <p class="small muted">Цвет ячейки усиливается вместе со значением метрики. Строка событий показывает, что меняли в этот день.</p>
          </div>
          <div class="badge-stack">
            ${badge(`${fmt.int(model.dateKeys.length)} дней`, model.dateKeys.length ? 'info' : 'warn')}
            ${model.searchNeedle ? badge('фильтр SKU / событие', 'warn') : badge('площадка целиком', 'ok')}
          </div>
        </div>
        <div class="table-wrap ads-control-table-wrap">
          <table class="ads-control-heatmap">
            <thead>
              <tr>
                <th class="ads-sticky ads-col-index">№</th>
                <th class="ads-sticky ads-col-metric">Метрика</th>
                <th class="ads-sticky ads-col-formula">Расчет</th>
                <th class="ads-sticky ads-col-average">Среднее</th>
                ${model.dateKeys.map((dateKey) => `<th class="ads-date-col"><span>${escapeHtml(adsFunnelDateShort(dateKey))}</span><small>${escapeHtml(dateKey.slice(0, 4))}</small></th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${model.tableRows.map((row) => `
                <tr class="${row.metric.format === 'events' ? 'ads-events-row' : ''}">
                  <td class="ads-sticky ads-col-index">${fmt.int(row.metric.row)}</td>
                  <td class="ads-sticky ads-col-metric"><strong>${escapeHtml(row.metric.label)}</strong></td>
                  <td class="ads-sticky ads-col-formula">${escapeHtml(row.metric.formula)}</td>
                  <td class="ads-sticky ads-col-average">${row.metric.format === 'events' ? fmt.int(row.average) : adsFunnelFormatMetric(row.metric, row.average)}</td>
                  ${model.dateKeys.map((dateKey, index) => renderCell(row, dateKey, index)).join('')}
                </tr>
              `).join('') || `<tr><td colspan="4"><div class="empty">Нет данных по выбранному периоду.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  root.querySelector('#adsFunnelSearch')?.addEventListener('input', (event) => {
    getAdsFunnelFilters().search = event.target.value;
    rerenderCurrentView();
  });
  root.querySelectorAll('[data-ads-platform]').forEach((button) => {
    button.addEventListener('click', () => {
      getAdsFunnelFilters().platform = adsFunnelNormalizePlatformKey(button.getAttribute('data-ads-platform'));
      rerenderCurrentView();
    });
  });
  root.querySelector('#adsFunnelHorizon')?.addEventListener('change', (event) => {
    getAdsFunnelFilters().horizon = String(event.target.value || '28');
    rerenderCurrentView();
  });
  root.querySelector('[data-ads-refresh]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Обновляю...';
    try {
      if (state.boot?.lazyReady) state.boot.lazyReady.adsFunnel = false;
      if (state.boot?.lazyLoads) delete state.boot.lazyLoads.adsFunnel;
      if (typeof ensureViewData === 'function') await ensureViewData('ads-funnel');
      rerenderCurrentView();
    } catch (error) {
      console.error(error);
      if (typeof setAppError === 'function') setAppError(`Не удалось обновить контроль РК: ${error.message}`);
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  });
  root.querySelector('[data-ads-export]')?.addEventListener('click', () => {
    downloadAdsFunnelHeatmapExcel(model);
  });
}

function normalizeIuQuarterSummaryPayload(quarter = {}) {
  return quarter && typeof quarter === 'object'
    ? {
        ...quarter,
        status: String(quarter.status || ''),
        from: String(quarter.from || '').slice(0, 10),
        to: String(quarter.to || '').slice(0, 10),
        label: String(quarter.label || ''),
        days: Math.round(numberOrZero(quarter.days)),
        targetRevenueWb: numberOrZero(quarter.targetRevenueWb),
        revenueWb: numberOrZero(quarter.revenueWb),
        ordersRevenueWb: numberOrZero(quarter.ordersRevenueWb),
        revenueDelta: numberOrZero(quarter.revenueDelta),
        revenueDeltaPct: Number.isFinite(Number(quarter.revenueDeltaPct)) ? Number(quarter.revenueDeltaPct) : null,
        revenueCompletionPct: Number.isFinite(Number(quarter.revenueCompletionPct)) ? Number(quarter.revenueCompletionPct) : null,
        planPct: Number.isFinite(Number(quarter.planPct)) ? Number(quarter.planPct) : 0,
        planSpendWb: numberOrZero(quarter.planSpendWb),
        spendFact: numberOrZero(quarter.spendFact),
        factPct: Number.isFinite(Number(quarter.factPct)) ? Number(quarter.factPct) : null,
        ordersAdPct: Number.isFinite(Number(quarter.ordersAdPct)) ? Number(quarter.ordersAdPct) : null,
        spendDelta: numberOrZero(quarter.spendDelta),
        spendDeltaPct: Number.isFinite(Number(quarter.spendDeltaPct)) ? Number(quarter.spendDeltaPct) : null,
        source: quarter.source || {},
        sourceLabel: String(quarter.sourceLabel || ''),
        sourceWarnings: Array.isArray(quarter.sourceWarnings) ? quarter.sourceWarnings : []
      }
    : {};
}

const OZON_FINANCE_UI_FIELDS = [
  'salesGross',
  'realizationRevenue',
  'discountBonus',
  'partnerPrograms',
  'realizationSalesGross',
  'realizationReturnRevenue',
  'realizationReturnBonus',
  'returnsGross',
  'ozonReward',
  'deliveryServices',
  'partnerServices',
  'fboServices',
  'ads',
  'otherServices',
  'compensations',
  'accruedNet'
];

function normalizeOzonFinanceBucket(row = {}) {
  const normalized = {
    ...row,
    key: String(row?.key || row?.date || row?.monthKey || row?.sku || row?.article || ''),
    label: String(row?.label || row?.name || row?.productName || row?.date || row?.monthKey || row?.sku || ''),
    date: String(row?.date || row?.key || '').slice(0, 10),
    monthKey: String(row?.monthKey || row?.date || row?.key || '').slice(0, 7),
    period: String(row?.period || row?.date || row?.key || ''),
    rowCount: numberOrZero(row?.rowCount),
    quantity: numberOrZero(row?.quantity)
  };
  OZON_FINANCE_UI_FIELDS.forEach((field) => {
    normalized[field] = numberOrZero(row?.[field]);
  });
  normalized.adsDrr = normalized.salesGross > 0 ? Math.abs(normalized.ads) / normalized.salesGross : null;
  normalized.adsAbs = Math.abs(normalized.ads);
  normalized.commissionPct = normalized.salesGross > 0 ? Math.abs(normalized.ozonReward) / normalized.salesGross : null;
  normalized.logisticsPct = normalized.salesGross > 0 ? Math.abs(normalized.deliveryServices) / normalized.salesGross : null;
  return normalized;
}

function normalizeOzonFinancePayload(payload = {}) {
  const daily = Array.isArray(payload.daily) ? payload.daily.map(normalizeOzonFinanceBucket).filter((row) => row.date) : [];
  const months = Array.isArray(payload.months) ? payload.months.map(normalizeOzonFinanceBucket).filter((row) => row.monthKey) : [];
  return {
    ...payload,
    status: payload.status || '',
    source: payload.source || {},
    window: payload.window || {},
    totals: normalizeOzonFinanceBucket(payload.totals || {}),
    daily,
    months,
    groups: Array.isArray(payload.groups) ? payload.groups.map(normalizeOzonFinanceBucket) : [],
    sku: Array.isArray(payload.sku) ? payload.sku.map((row) => ({
      ...normalizeOzonFinanceBucket(row),
      sku: String(row?.sku || ''),
      article: String(row?.article || ''),
      productName: String(row?.productName || row?.name || ''),
      category: String(row?.category || ''),
      productType: String(row?.productType || ''),
      status: String(row?.status || ''),
      ozonProductId: String(row?.ozonProductId || ''),
      fboStock: numberOrZero(row?.fboStock),
      fbsStock: numberOrZero(row?.fbsStock),
      realFbsStock: numberOrZero(row?.realFbsStock),
      availableStock: numberOrZero(row?.availableStock),
      reservedStock: numberOrZero(row?.reservedStock),
      price: numberOrZero(row?.price),
      unmapped: Boolean(row?.unmapped)
    })) : [],
    categories: Array.isArray(payload.categories) ? payload.categories.map(normalizeOzonFinanceBucket) : [],
    types: Array.isArray(payload.types) ? payload.types.map(normalizeOzonFinanceBucket) : [],
    control: {
      rowsAccruedNet: numberOrZero(payload.control?.rowsAccruedNet),
      sellerUiAccruedNet: payload.control?.sellerUiAccruedNet === null || payload.control?.sellerUiAccruedNet === undefined
        ? null
        : numberOrZero(payload.control.sellerUiAccruedNet),
      deltaToSellerUi: payload.control?.deltaToSellerUi === null || payload.control?.deltaToSellerUi === undefined
        ? null
        : numberOrZero(payload.control.deltaToSellerUi)
    },
    diagnostics: payload.diagnostics || {}
  };
}

function ozonFinanceBucketHasValues(bucket = {}) {
  return numberOrZero(bucket.rowCount) > 0
    || OZON_FINANCE_UI_FIELDS.some((field) => numberOrZero(bucket?.[field]) !== 0);
}

function ozonFinanceWindowMatchesMonth(ozonFinance = {}, selectedMonth = '') {
  const totalsMonth = String(ozonFinance.totals?.monthKey || '').slice(0, 7);
  const fromMonth = String(ozonFinance.window?.from || '').slice(0, 7);
  const toMonth = String(ozonFinance.window?.to || '').slice(0, 7);
  return Boolean(selectedMonth && (
    totalsMonth === selectedMonth
    || (fromMonth === selectedMonth && toMonth === selectedMonth)
  ));
}

function ozonFinanceMonthSummary(ozonFinance, selectedMonth) {
  const month = (ozonFinance.months || []).find((row) => row.monthKey === selectedMonth);
  if (month) return month;
  const totals = normalizeOzonFinanceBucket({ ...ozonFinance.totals, monthKey: selectedMonth });
  if (ozonFinanceWindowMatchesMonth(ozonFinance, selectedMonth) && ozonFinanceBucketHasValues(totals)) {
    return totals;
  }
  return normalizeOzonFinanceBucket({ key: selectedMonth, label: selectedMonth, monthKey: selectedMonth });
}

function daysInMonthKey(monthKey = '') {
  const [year, month] = String(monthKey || '').split('-').map((part) => Number(part));
  if (!year || !month) return 30;
  return new Date(year, month, 0).getDate();
}

function ozonPlanMonthSummary(ozonPlan = {}, selectedMonth = '') {
  const monthly = (ozonPlan.monthly || []).find((row) => row.monthKey === selectedMonth);
  if (monthly) return monthly;
  const rows = (ozonPlan.daily || []).filter((row) => row.monthKey === selectedMonth);
  const totals = rows.reduce((sum, row) => {
    sum.revenue += numberOrZero(row.revenue);
    sum.gmv += numberOrZero(row.gmv);
    sum.ads += numberOrZero(row.ads);
    sum.deltaToTargetSpend += numberOrZero(row.deltaToTargetSpend);
    sum.cumulativeAds = numberOrZero(row.cumulativeAds) || sum.cumulativeAds;
    sum.forecastDailyAds = numberOrZero(row.forecastDailyAds) || sum.forecastDailyAds;
    sum.targetDrr = numberOrZero(row.targetDrr) || sum.targetDrr || 0.25;
    return sum;
  }, { revenue: 0, gmv: 0, ads: 0, deltaToTargetSpend: 0, cumulativeAds: 0, forecastDailyAds: 0, targetDrr: 0.25 });
  totals.drrGmv = totals.gmv > 0 ? totals.ads / totals.gmv : null;
  totals.drrRevenue = totals.revenue > 0 ? totals.ads / totals.revenue : null;
  const smartShare = numberOrZero(ozonPlan.allocation?.smartShare || 0.4);
  return {
    monthKey: selectedMonth,
    monthlyTargetGmv: numberOrZero(ozonPlan.monthlyTargets?.[selectedMonth]),
    accounts: [],
    totals,
    allocation: {
      smartShare,
      totalAds: totals.ads,
      smartAllocatedAds: totals.ads * smartShare,
      otherAllocatedAds: totals.ads * (1 - smartShare),
      totalGmv: totals.gmv,
      smartAllocatedGmv: totals.gmv * smartShare
    }
  };
}

function normalizeIuDrrSummaryPayload(payload = {}) {
  const daily = Array.isArray(payload.daily) ? payload.daily.map((row) => ({
    ...row,
    date: String(row?.date || '').slice(0, 10),
    monthKey: String(row?.monthKey || row?.date || '').slice(0, 7),
    targetRevenueWb: numberOrZero(row?.targetRevenueWb),
    managementTargetRevenueWb: numberOrZero(row?.managementTargetRevenueWb),
    managementPlanSpendWb: numberOrZero(row?.managementPlanSpendWb),
    revenueWb: numberOrZero(row?.revenueWb),
    ordersRevenueWb: numberOrZero(row?.ordersRevenueWb),
    adsPctBaseWb: numberOrZero(row?.adsPctBaseWb || row?.revenueWb),
    revenueWbDelta: numberOrZero(row?.revenueWbDelta),
    revenueWbDeltaPct: Number.isFinite(Number(row?.revenueWbDeltaPct)) ? Number(row.revenueWbDeltaPct) : null,
    revenueWbCompletionPct: Number.isFinite(Number(row?.revenueWbCompletionPct)) ? Number(row.revenueWbCompletionPct) : null,
    targetRevenueOzon: numberOrZero(row?.targetRevenueOzon),
    revenueOzon: numberOrZero(row?.revenueOzon),
    revenueOzonDelta: numberOrZero(row?.revenueOzonDelta),
    revenueOzonDeltaPct: Number.isFinite(Number(row?.revenueOzonDeltaPct)) ? Number(row.revenueOzonDeltaPct) : null,
    revenueOzonCompletionPct: Number.isFinite(Number(row?.revenueOzonCompletionPct)) ? Number(row.revenueOzonCompletionPct) : null,
    planPctOzon: Number.isFinite(Number(row?.planPctOzon)) ? Number(row.planPctOzon) : 0,
    planSpendOzon: numberOrZero(row?.planSpendOzon),
    spendFactOzon: numberOrZero(row?.spendFactOzon),
    factPctOzon: Number.isFinite(Number(row?.factPctOzon)) ? Number(row.factPctOzon) : null,
    spendDeltaOzon: numberOrZero(row?.spendDeltaOzon),
    spendDeltaOzonPct: Number.isFinite(Number(row?.spendDeltaOzonPct)) ? Number(row.spendDeltaOzonPct) : null,
    ozonAdsFactMode: String(row?.ozonAdsFactMode || ''),
    targetRevenueYandex: numberOrZero(row?.targetRevenueYandex),
    revenueYandex: numberOrZero(row?.revenueYandex),
    ordersRevenueYandex: numberOrZero(row?.ordersRevenueYandex),
    revenueYandexDelta: numberOrZero(row?.revenueYandexDelta),
    revenueYandexDeltaPct: Number.isFinite(Number(row?.revenueYandexDeltaPct)) ? Number(row.revenueYandexDeltaPct) : null,
    revenueYandexCompletionPct: Number.isFinite(Number(row?.revenueYandexCompletionPct)) ? Number(row.revenueYandexCompletionPct) : null,
    planSpendYandex: numberOrZero(row?.planSpendYandex),
    spendFactYandex: numberOrZero(row?.spendFactYandex),
    factPctYandex: Number.isFinite(Number(row?.factPctYandex)) ? Number(row.factPctYandex) : null,
    yandexAdsFactMode: String(row?.yandexAdsFactMode || ''),
    unitsYandex: numberOrZero(row?.unitsYandex),
    ordersUnitsYandex: numberOrZero(row?.ordersUnitsYandex),
    deliveredUnitsYandex: numberOrZero(row?.deliveredUnitsYandex),
    yandexShows: numberOrZero(row?.yandexShows),
    yandexClicks: numberOrZero(row?.yandexClicks),
    yandexToCart: numberOrZero(row?.yandexToCart),
    yandexCtr: Number.isFinite(Number(row?.yandexCtr)) ? Number(row.yandexCtr) : null,
    yandexCartRate: Number.isFinite(Number(row?.yandexCartRate)) ? Number(row.yandexCartRate) : null,
    yandexOrderRate: Number.isFinite(Number(row?.yandexOrderRate)) ? Number(row.yandexOrderRate) : null,
    yandexBuyoutRate: Number.isFinite(Number(row?.yandexBuyoutRate)) ? Number(row.yandexBuyoutRate) : null,
    yandexCancellationsUnits: numberOrZero(row?.yandexCancellationsUnits),
    yandexReturnsUnits: numberOrZero(row?.yandexReturnsUnits),
    yandexSourceRows: numberOrZero(row?.yandexSourceRows),
    revenueTotalIu: numberOrZero(row?.revenueTotalIu),
    planPct: Number.isFinite(Number(row?.planPct)) ? Number(row.planPct) : 0,
    planSpendWb: numberOrZero(row?.planSpendWb),
    spendFact: numberOrZero(row?.spendFact),
    spendFactDrr: numberOrZero(row?.spendFactDrr || row?.spendFact),
    spendFactTotal: numberOrZero(row?.spendFactTotal || row?.spendFact),
    spendFactIu: numberOrZero(row?.spendFactIu),
    spendFactTotalIu: numberOrZero(row?.spendFactTotalIu),
    factPct: Number.isFinite(Number(row?.factPct)) ? Number(row.factPct) : null,
    factPctIu: Number.isFinite(Number(row?.factPctIu)) ? Number(row.factPctIu) : null,
    ordersAdPct: Number.isFinite(Number(row?.ordersAdPct)) ? Number(row.ordersAdPct) : null,
    wbPromotion: numberOrZero(row?.wbPromotion),
    wbMedia: numberOrZero(row?.wbMedia),
    wbInfluencer: numberOrZero(row?.wbInfluencer),
    pvzAds: numberOrZero(row?.pvzAds),
    brandZone: numberOrZero(row?.brandZone),
    overviews: numberOrZero(row?.overviews),
    reviewPoints: numberOrZero(row?.reviewPoints),
    externalAds: numberOrZero(row?.externalAds),
    spendDelta: numberOrZero(row?.spendDelta),
    spendDeltaPct: Number.isFinite(Number(row?.spendDeltaPct)) ? Number(row.spendDeltaPct) : null,
    spendDeltaIu: numberOrZero(row?.spendDeltaIu),
    spendDeltaIuPct: Number.isFinite(Number(row?.spendDeltaIuPct)) ? Number(row.spendDeltaIuPct) : null,
    adsViews: numberOrZero(row?.adsViews),
    adsClicks: numberOrZero(row?.adsClicks),
    adsOrders: numberOrZero(row?.adsOrders)
  })).map((row) => {
    const wbTarget = numberOrZero(row.targetRevenueWb || row.contractTargetRevenueWb || row.managementTargetRevenueWb);
    const wbFactRevenue = numberOrZero(row.wbApiRevenue || row.adsPctBaseWb || row.revenueWb || row.ordersRevenueWb);
    const wbOrdersRevenue = numberOrZero(row.ordersRevenueWb);
    const wbPlanPct = Number.isFinite(Number(row.planPct)) ? Number(row.planPct) : 0;
    const wbPlanSpend = numberOrZero(row.planSpendWb);
    const wbPlanSpendByRevenue = wbPlanSpend || (wbFactRevenue * wbPlanPct);
    const wbSpendFact = numberOrZero(row.wbApiSpendFact || row.spendFact);
    return {
      ...row,
      iuTargetRevenueWb: wbTarget,
      iuRevenueWb: wbFactRevenue,
      iuOrdersRevenueWb: wbFactRevenue,
      iuOrdersRevenueWbControl: wbOrdersRevenue,
      iuRevenueWbDelta: wbFactRevenue - wbTarget,
      iuRevenueWbDeltaPct: wbTarget > 0 ? (wbFactRevenue - wbTarget) / wbTarget : null,
      iuRevenueWbCompletionPct: wbTarget > 0 ? wbFactRevenue / wbTarget : null,
      iuPlanSpendWb: wbPlanSpendByRevenue,
      iuFactPct: wbFactRevenue > 0 ? wbSpendFact / wbFactRevenue : null,
      iuSpendDelta: wbSpendFact - wbPlanSpendByRevenue,
      iuSpendDeltaPct: wbPlanSpendByRevenue > 0 ? (wbSpendFact - wbPlanSpendByRevenue) / wbPlanSpendByRevenue : null
    };
  }).filter((row) => row.date) : [];
  const months = Array.isArray(payload.months) ? payload.months : [];
  const channels = Array.isArray(payload.channels) ? payload.channels : [];
  const quarterSummary = normalizeIuQuarterSummaryPayload(payload.quarterSummary || payload.wbQuarter || {});
  const ozonFinance = normalizeOzonFinancePayload(payload.ozonFinance || {});
  return {
    ...payload,
    generatedAt: payload.generatedAt || '',
    asOfDate: payload.asOfDate || daily.map((row) => row.date).sort().at(-1) || '',
    daily,
    months,
    channels,
    ozonFinance,
    quarterSummary,
    wbQuarter: quarterSummary,
    diagnostics: payload.diagnostics || {}
  };
}

function getIuDrrFilters() {
  state.iuDrrFilters = state.iuDrrFilters || {};
  state.iuDrrFilters.month = state.iuDrrFilters.month || 'latest';
  state.iuDrrFilters.platform = PORTAL_MARKETPLACE_KEYS_EXTENDED.includes(state.iuDrrFilters.platform) ? state.iuDrrFilters.platform : 'wb';
  return state.iuDrrFilters;
}

function iuDrrMonthOptions(payload) {
  const keys = new Set();
  (payload.months || []).forEach((month) => month?.monthKey && keys.add(month.monthKey));
  (payload.daily || []).forEach((row) => row?.monthKey && keys.add(row.monthKey));
  (payload.planTruth?.months || []).forEach((month) => month?.monthKey && keys.add(month.monthKey));
  return [...keys].sort().map((key) => {
    const source = (payload.months || []).find((month) => month.monthKey === key)
      || (payload.planTruth?.months || []).find((month) => month.monthKey === key);
    return { key, label: source?.label || key };
  });
}

function iuDrrLatestMonth(payload) {
  const actualKeys = new Set();
  (payload.months || []).forEach((month) => month?.monthKey && actualKeys.add(month.monthKey));
  (payload.daily || []).forEach((row) => row?.monthKey && actualKeys.add(row.monthKey));
  const actualMonths = [...actualKeys].sort();
  if (actualMonths.length) return actualMonths.at(-1);
  const options = iuDrrMonthOptions(payload);
  return options.at(-1)?.key || '';
}

function iuDrrMonthParts(monthKey = '') {
  const [year, month] = String(monthKey || '').split('-').map((part) => Number(part));
  return year && month >= 1 && month <= 12 ? { year, month } : null;
}

function iuDrrDateParts(dateKey = '') {
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  return year && month && day ? { year, month, day } : null;
}

function iuDrrDateKey(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function iuDrrMonthStart(monthKey = '') {
  const parts = iuDrrMonthParts(monthKey);
  return parts ? iuDrrDateKey(parts.year, parts.month, 1) : '';
}

function iuDrrMonthEnd(monthKey = '') {
  const parts = iuDrrMonthParts(monthKey);
  return parts ? iuDrrDateKey(parts.year, parts.month, daysInMonthKey(monthKey)) : '';
}

function iuDrrDateMax(left = '', right = '') {
  if (!left) return right || '';
  if (!right) return left || '';
  return left > right ? left : right;
}

function iuDrrDateMin(left = '', right = '') {
  if (!left) return right || '';
  if (!right) return left || '';
  return left < right ? left : right;
}

function iuDrrDaysBetween(from = '', to = '') {
  const start = iuDrrDateParts(from);
  const end = iuDrrDateParts(to);
  if (!start || !end || from > to) return 0;
  const startUtc = Date.UTC(start.year, start.month - 1, start.day);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day);
  return Math.max(0, Math.round((endUtc - startUtc) / 86400000) + 1);
}

function iuDrrQuarterRange(monthKey = '') {
  const parts = iuDrrMonthParts(monthKey);
  if (!parts) return { from: '', to: '', months: [], days: 0, label: '' };
  const firstMonth = Math.floor((parts.month - 1) / 3) * 3 + 1;
  const months = [0, 1, 2].map((offset) => `${parts.year}-${String(firstMonth + offset).padStart(2, '0')}`);
  const from = iuDrrMonthStart(months[0]);
  const to = iuDrrMonthEnd(months[2]);
  return {
    from,
    to,
    months,
    days: months.reduce((sum, month) => sum + daysInMonthKey(month), 0),
    label: `${String(from).slice(8, 10)}.${String(from).slice(5, 7)}–${String(to).slice(8, 10)}.${String(to).slice(5, 7)}`
  };
}

function iuDrrPlanTruthRows(model = {}, monthKeys = []) {
  const monthSet = new Set(monthKeys);
  return (model.payload?.planTruth?.months || [])
    .filter((month) => monthSet.has(month.monthKey))
    .sort((left, right) => String(left.monthKey).localeCompare(String(right.monthKey)));
}

function iuDrrPlanTruthSum(model = {}, monthKeys = [], platformKey = 'wb', field = '') {
  return iuDrrPlanTruthRows(model, monthKeys)
    .reduce((sum, month) => sum + numberOrZero(month?.[platformKey]?.[field]), 0);
}

function iuDrrPlanTruthMonth(payload = {}, monthKey = '') {
  const planTruth = payload.payload?.planTruth || payload.planTruth || {};
  return (planTruth.months || []).find((month) => month.monthKey === monthKey) || {};
}

function iuDrrFirstPositive(...values) {
  for (const value of values) {
    const numeric = numberOrZero(value);
    if (numeric > 0) return numeric;
  }
  return 0;
}

function iuDrrFirstText(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function iuDrrContractTargetForRange(model = {}, from = '', to = '') {
  const periods = Array.isArray(model.payload?.contractPeriods) ? model.payload.contractPeriods : [];
  return periods.reduce((sum, period) => {
    const periodFrom = String(period.from || '');
    const periodTo = String(period.to || '');
    const overlapFrom = iuDrrDateMax(from, periodFrom);
    const overlapTo = iuDrrDateMin(to, periodTo);
    const overlapDays = iuDrrDaysBetween(overlapFrom, overlapTo);
    const periodDays = iuDrrDaysBetween(periodFrom, periodTo);
    if (!overlapDays || !periodDays) return sum;
    return sum + numberOrZero(period.targetRevenue) * (overlapDays / periodDays);
  }, 0);
}

function iuDrrQuarterFactBase(model = {}, platformKey = 'wb', context = {}) {
  const selectedMonth = model.selectedMonth || '';
  const sourceRows = (model.payload?.daily || []).filter((row) => row.monthKey === selectedMonth);
  if (platformKey === 'ozon') {
    const datedRows = sourceRows.filter((row) => row.date && (numberOrZero(row.revenueOzon) || numberOrZero(row.targetRevenueOzon)));
    const factFromDaily = datedRows.reduce((sum, row) => sum + numberOrZero(row.revenueOzon), 0);
    const planFactRows = Array.isArray(context.ozonPlanFactRows) ? context.ozonPlanFactRows : [];
    const planFactRowsWithFact = planFactRows.filter((row) => (
      numberOrZero(row.factGmv)
      || numberOrZero(row.factRevenue)
      || numberOrZero(row.noSppBuyouts)
      || numberOrZero(row.adsBoth)
    ));
    const lastPlanFact = planFactRowsWithFact.at(-1) || {};
    const factFromPlanFact = numberOrZero(lastPlanFact.cumulativeFactGmv);
    const fact = factFromPlanFact
      || factFromDaily
      || numberOrZero(model.monthSummary?.iuRevenueOzonFactToDate || model.monthSummary?.revenueOzon);
    const dates = factFromPlanFact ? planFactRowsWithFact.map((row) => row.date) : datedRows.map((row) => row.date);
    const days = new Set(dates.filter(Boolean)).size
      || numberOrZero(model.monthSummary?.daysInSummary)
      || (ozonFinanceWindowMatchesMonth(model.ozonFinance || {}, selectedMonth)
        ? numberOrZero(model.ozonFinance?.window?.days)
        : 0);
    return {
      fact,
      days,
      from: dates.filter(Boolean).sort()[0] || '',
      to: dates.filter(Boolean).sort().at(-1) || '',
      sourceLabel: factFromPlanFact ? 'Smart-факт ИУ Ozon' : 'Факт Ozon'
    };
  }
  if (platformKey === 'ya') {
    const datedRows = sourceRows.filter((row) => row.date && (numberOrZero(row.revenueYandex) || numberOrZero(row.targetRevenueYandex)));
    const fact = datedRows.reduce((sum, row) => sum + numberOrZero(row.revenueYandex), 0)
      || numberOrZero(model.monthSummary?.iuRevenueYandexFactToDate || model.monthSummary?.revenueYandex);
    const dates = datedRows.map((row) => row.date).filter(Boolean).sort();
    return {
      fact,
      days: new Set(dates).size || numberOrZero(model.monthSummary?.daysInSummary),
      from: dates[0] || '',
      to: dates.at(-1) || '',
      sourceLabel: 'Yandex Market sales funnel'
    };
  }
  const datedRows = sourceRows.filter((row) => row.date && (numberOrZero(row.wbApiRevenue || row.iuRevenueWb || row.revenueWb || row.adsPctBaseWb || row.ordersRevenueWb) || numberOrZero(row.targetRevenueWb)));
  const fact = datedRows.reduce((sum, row) => sum + numberOrZero(row.wbApiRevenue || row.iuRevenueWb || row.revenueWb || row.adsPctBaseWb || row.ordersRevenueWb), 0)
    || numberOrZero(model.monthSummary?.iuRevenueWbFactToDate || model.monthSummary?.revenueWb);
  const dates = datedRows.map((row) => row.date).filter(Boolean).sort();
  return {
    fact,
    days: new Set(dates).size || numberOrZero(model.monthSummary?.daysInSummary),
    from: dates[0] || '',
    to: dates.at(-1) || '',
    sourceLabel: 'Факт WB'
  };
}

function iuDrrForecastCompletionTone(value) {
  if (!iuDrrFunnelFinite(value)) return 'info';
  const numeric = Number(value);
  if (numeric >= 1) return 'ok';
  if (numeric >= 0.9) return 'warn';
  return 'danger';
}

function iuDrrForecastStatusLabel(value) {
  if (!iuDrrFunnelFinite(value)) return 'нет факта';
  const numeric = Number(value);
  if (numeric >= 1) return 'прогноз закрывает';
  if (numeric >= 0.9) return 'рядом с планом';
  return 'темп ниже плана';
}

function iuDrrBuildQuarterForecast(model = {}, context = {}) {
  const platformKey = PORTAL_MARKETPLACE_KEYS_EXTENDED.includes(model.selectedPlatform) ? model.selectedPlatform : 'wb';
  const quarter = iuDrrQuarterRange(model.selectedMonth);
  if (!PORTAL_MARKETPLACE_CORE_IU_DRR_KEYS.includes(platformKey)) {
    return {
      available: false,
      platformKey,
      platformLabel: adsFunnelPlatformLabel(platformKey),
      quarter,
      daysTotal: quarter.days || 0,
      factToDate: 0,
      elapsedDays: 0,
      factFrom: '',
      factTo: '',
      factSourceLabel: 'нет источника IU/DRR',
      dailyAverage: null,
      projectedFact: null,
      month: { key: model.selectedMonth || '', days: daysInMonthKey(model.selectedMonth), fact: 0, elapsedDays: 0, dailyAverage: null, projectedFact: null, iuPlan: 0, portalPlan: 0, iuCompletion: null, factCompletion: null },
      rawCorporatePlan: 0,
      ruleSelectedPlan: 0,
      selectedPlan: 0,
      plans: []
    };
  }
  const factBase = iuDrrQuarterFactBase(model, platformKey, context);
  const daysTotal = quarter.days || quarter.months.reduce((sum, month) => sum + daysInMonthKey(month), 0);
  const hasFactForTempo = factBase.days > 0 && factBase.fact > 0;
  const dailyAverage = hasFactForTempo ? factBase.fact / factBase.days : null;
  const projectedFact = hasFactForTempo ? dailyAverage * daysTotal : null;
  const platformTruthKey = platformKey === 'ozon' ? 'ozon' : 'wb';
  const truthIuPlan = platformKey === 'ozon'
    ? iuDrrPlanTruthSum(model, quarter.months, 'ozon', 'iuPlan40')
    : platformKey === 'ya'
      ? 0
      : iuDrrPlanTruthSum(model, quarter.months, 'wb', 'iuPlan');
  const wbContractPlan = platformKey === 'wb' ? iuDrrContractTargetForRange(model, quarter.from, quarter.to) : 0;
  const iuPlan = platformKey === 'wb' ? (wbContractPlan || truthIuPlan) : truthIuPlan;
  const yandexQuarterPlan = platformKey === 'ya'
    ? quarter.months.reduce((sum, monthKey) => {
      const monthRow = (model.payload?.months || []).find((item) => item.monthKey === monthKey) || {};
      const truthMonth = iuDrrPlanTruthMonth(model.payload || {}, monthKey);
      return sum + numberOrZero(monthRow.iuRevenueYandexPlan || truthMonth.otherChannels?.ya);
    }, 0)
    : 0;
  const corporatePlan = platformKey === 'ya' ? yandexQuarterPlan : iuDrrPlanTruthSum(model, quarter.months, platformTruthKey, 'corporatePlan');
  const selectedPlan = platformKey === 'ya' ? yandexQuarterPlan : iuDrrPlanTruthSum(model, quarter.months, platformTruthKey, 'selectedRevenue');
  const workingPlan = Math.max(numberOrZero(selectedPlan), numberOrZero(iuPlan), numberOrZero(corporatePlan));
  const month = model.monthSummary || {};
  const monthDays = daysInMonthKey(model.selectedMonth);
  const monthIuPlan = platformKey === 'ya'
    ? numberOrZero(month.iuRevenueYandexPlanToDate || month.targetRevenueYandex || month.iuRevenueYandexPlan)
    : platformKey === 'ozon'
    ? numberOrZero(month.iuRevenueOzonContractMin)
    : numberOrZero(month.iuRevenueWbIuMin);
  const monthPortalPlan = platformKey === 'ya'
    ? numberOrZero(month.iuRevenueYandexPlanToDate || month.targetRevenueYandex || month.iuRevenueYandexPlan)
    : platformKey === 'ozon'
    ? numberOrZero(month.iuRevenueOzonPlan)
    : numberOrZero(month.iuRevenueWbPlan);
  const monthProjectedFact = hasFactForTempo && monthDays ? dailyAverage * monthDays : null;
  const makeBlock = (key, label, plan, sourceLabel) => {
    const completion = plan > 0 && projectedFact !== null ? projectedFact / plan : null;
    return {
      key,
      label,
      sourceLabel,
      plan,
      completion,
      delta: plan > 0 && projectedFact !== null ? projectedFact - plan : null,
      tone: iuDrrForecastCompletionTone(completion)
    };
  };
  return {
    available: Boolean(quarter.months.length && daysTotal && (factBase.fact || iuPlan || workingPlan)),
    platformKey,
    platformLabel: platformKey === 'ya' ? 'Я.Маркет' : (platformKey === 'ozon' ? 'Ozon' : 'WB'),
    quarter,
    daysTotal,
    factToDate: factBase.fact,
    elapsedDays: factBase.days,
    factFrom: factBase.from,
    factTo: factBase.to,
    factSourceLabel: factBase.sourceLabel,
    dailyAverage,
    projectedFact,
    month: {
      key: model.selectedMonth || '',
      days: monthDays,
      fact: factBase.fact,
      elapsedDays: factBase.days,
      dailyAverage,
      projectedFact: monthProjectedFact,
      iuPlan: monthIuPlan,
      portalPlan: monthPortalPlan,
      iuCompletion: monthIuPlan > 0 && monthProjectedFact !== null ? monthProjectedFact / monthIuPlan : null,
      factCompletion: monthIuPlan > 0 ? factBase.fact / monthIuPlan : null
    },
    rawCorporatePlan: corporatePlan,
    ruleSelectedPlan: selectedPlan,
    selectedPlan: workingPlan,
    plans: [
      makeBlock(
        'iu',
        platformKey === 'ozon' ? 'ИУ план Ozon 40%' : 'ИУ план WB',
        iuPlan,
        platformKey === 'ozon' ? 'ИУ Ozon × 40%, сумма месяцев квартала' : 'ИУ WB, сумма месяцев квартала'
      ),
      makeBlock(
        'working',
        'Рабочий план портала',
        workingPlan,
        'по каждому месяцу берём большее: ИУ или корпоративный план'
      )
    ]
  };
}

function iuDrrQuarterForecastScoreCards(forecast = {}) {
  if (!forecast.available) return [];
  return (forecast.plans || []).filter((plan) => numberOrZero(plan.plan) > 0).map((plan) => ({
    label: plan.label,
    value: plan.completion == null ? '—' : fmt.pct(plan.completion),
    detail: `прогноз к концу квартала ${fmt.money(forecast.projectedFact)} / план ${fmt.money(plan.plan)}`,
    status: plan.completion == null ? 'нет факта для темпа' : iuDrrForecastStatusLabel(plan.completion),
    progress: plan.completion,
    tone: plan.tone,
    marks: ['80%', '90%', plan.completion == null ? '—' : fmt.pct(plan.completion), '100%']
  }));
}

function iuDrrPlanFactCompletionLevel(value) {
  if (typeof skuPlanFactCompletionLevel === 'function') return skuPlanFactCompletionLevel(value);
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 0;
  const ratio = Number(value);
  if (ratio >= 1.2) return 5;
  if (ratio >= 1) return 4;
  if (ratio >= 0.8) return 3;
  if (ratio >= 0.5) return 2;
  return ratio > 0 ? 1 : 0;
}

function iuDrrPlanFactCardStyle(platformKey = 'wb', completion = null) {
  if (typeof skuPlanFactCardStyle === 'function') return skuPlanFactCardStyle(platformKey, completion);
  const ratio = completion === null || completion === undefined || !Number.isFinite(Number(completion))
    ? 0.12
    : Math.min(1.35, Math.max(0.05, Number(completion)));
  const hue = platformKey === 'ozon' ? 212 : platformKey === 'ya' ? 47 : 272;
  const fill = 0.08 + Math.min(0.34, ratio * 0.24);
  const rowFill = Math.min(0.12, fill * 0.32);
  const border = 0.18 + Math.min(0.5, ratio * 0.3);
  const glow = 0.04 + Math.min(0.18, ratio * 0.12);
  const progress = Math.min(100, Math.max(0, ratio * 100));
  return `--pf-hue:${hue};--pf-fill:${fill.toFixed(3)};--pf-row-fill:${rowFill.toFixed(3)};--pf-border:${border.toFixed(3)};--pf-glow:${glow.toFixed(3)};--pf-progress:${progress.toFixed(1)}%;--pf-level:${iuDrrPlanFactCompletionLevel(completion)}`;
}

function iuDrrPlanFactDeltaClass(value) {
  if (typeof skuPlanFactDeltaClass === 'function') return skuPlanFactDeltaClass(value);
  if (value > 0) return 'ok-text';
  if (value < 0) return 'danger-text';
  return '';
}

function iuDrrForecastStatusText(completion) {
  if (completion == null) return 'Нет факта';
  return completion >= 1 ? 'Закрываем' : completion >= 0.9 ? 'Рядом с планом' : 'Ниже плана';
}

function iuDrrForecastDeltaText(delta) {
  if (delta == null) return 'нет факта для темпа';
  return delta >= 0 ? `запас +${fmt.money(delta)}` : `не хватает ${fmt.money(Math.abs(delta))}`;
}

function iuDrrQuarterPlanCardHtml(plan = {}, forecast = {}) {
  const completion = plan.completion;
  const completionText = completion == null ? 'выполнение —' : `выполнение ${fmt.pct(completion)}`;
  const statusText = iuDrrForecastStatusText(completion);
  const deltaText = iuDrrForecastDeltaText(plan.delta);
  const platformKey = forecast.platformKey === 'ozon' ? 'ozon' : 'wb';
  const level = iuDrrPlanFactCompletionLevel(completion);
  return `
    <div class="sku-plan-platform-card iu-drr-quarter-platform-card level-${level}" style="${iuDrrPlanFactCardStyle(platformKey, completion)}">
      <span class="sku-plan-platform-card__top">
        <strong>${escapeHtml(plan.label || 'План квартала')}</strong>
      </span>
      <span class="sku-plan-platform-card__value">${escapeHtml(statusText)}</span>
      <span class="sku-plan-platform-card__meta">ожидаем ${fmt.money(forecast.projectedFact)} / план ${fmt.money(plan.plan)} · ${escapeHtml(completionText)}</span>
      <span class="sku-plan-platform-card__bar"><i></i></span>
      <span class="sku-plan-platform-card__foot">
        <b class="${iuDrrPlanFactDeltaClass(plan.delta)}">${escapeHtml(deltaText)}</b>
      </span>
    </div>
  `;
}

function iuDrrForecastMetricHtml(label, value, detail = '', tip = '', tone = 'info') {
  const safeTone = ['ok', 'warn', 'danger', 'info'].includes(tone) ? tone : 'info';
  return `
    <div class="iu-drr-forecast-metric ${escapeHtml(safeTone)}" ${tip ? `data-tip="${escapeHtml(tip)}"` : ''}>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value == null || value === '' ? '—' : String(value))}</strong>
      <em>${escapeHtml(detail || '')}</em>
    </div>
  `;
}

function iuDrrQuarterForecastHeroHtml(plan = {}, forecast = {}) {
  const platformKey = PORTAL_MARKETPLACE_KEYS_EXTENDED.includes(forecast.platformKey) ? forecast.platformKey : 'wb';
  const month = forecast.month || {};
  const monthPlanLabel = platformKey === 'ya' ? 'ИУ план к дате Я.Маркет' : platformKey === 'ozon' ? 'ИУ план месяца Ozon 40%' : 'ИУ план месяца WB';
  const portalPlanLabel = platformKey === 'ya' ? 'План портала к дате Я.Маркет' : platformKey === 'ozon' ? 'Рабочий план месяца' : 'План портала месяца';
  const displayPlan = plan.key === 'working'
    ? numberOrZero(month.portalPlan)
    : numberOrZero(month.iuPlan);
  const displayFact = month.fact == null ? null : numberOrZero(month.fact);
  const completion = displayPlan > 0 && displayFact !== null ? displayFact / displayPlan : null;
  const displayDelta = displayPlan > 0 && displayFact !== null ? displayFact - displayPlan : null;
  const level = iuDrrPlanFactCompletionLevel(completion);
  const progress = completion == null ? 0 : Math.min(100, Math.max(0, Number(completion) * 100));
  const statusText = iuDrrForecastStatusText(completion);
  const completionText = completion == null ? '—' : fmt.pct(completion);
  const deltaText = iuDrrForecastDeltaText(displayDelta);
  const deltaTone = iuDrrPlanFactDeltaClass(displayDelta);
  const monthFactTone = iuDrrFunnelCompletionTone(month.factCompletion);
  const dayText = month.elapsedDays ? `${fmt.int(month.elapsedDays)} дн. факта` : 'нет факта';
  const fullMonthFact = month.days && month.elapsedDays >= month.days;
  const heroModeLabel = plan.key === 'working'
    ? (fullMonthFact ? 'факт месяца к плану портала' : 'факт на дату к плану портала')
    : (fullMonthFact ? 'факт месяца к ИУ' : 'факт на дату к ИУ');
  const heroPlanLabel = plan.key === 'working' ? portalPlanLabel : monthPlanLabel;
  return `
    <div class="iu-drr-forecast-hero level-${level}" style="${iuDrrPlanFactCardStyle(platformKey, completion)};--iu-drr-forecast-progress:${progress.toFixed(1)}%">
      <div class="iu-drr-forecast-main">
        <div class="iu-drr-forecast-score" data-tip="${escapeHtml(`Факт ИУ ${fmt.money(displayFact)} / ${heroPlanLabel} ${fmt.money(displayPlan)}. Без прогнозного умножения: берем только факт, который пришел в источник.`)}">
          <span>${escapeHtml(heroModeLabel)}</span>
          <strong>${escapeHtml(completionText)}</strong>
          <em>${escapeHtml(statusText)}</em>
        </div>
        <div class="iu-drr-forecast-track" title="${escapeHtml(`${fmt.money(displayFact)} / ${fmt.money(displayPlan)}`)}">
          <i></i>
          <span class="mark-80">80%</span>
          <span class="mark-90">90%</span>
          <span class="mark-100">100%</span>
        </div>
        <div class="iu-drr-forecast-delta" data-tip="${escapeHtml(`Разница между фактом ИУ и ${heroPlanLabel}.`)}">
          <span>${plan.key === 'working' ? 'отклонение к плану портала' : 'отклонение к ИУ'}</span>
          <strong class="${escapeHtml(deltaTone)}">${escapeHtml(deltaText)}</strong>
          <em>${fmt.money(displayFact)} / ${fmt.money(displayPlan)}</em>
        </div>
      </div>
      <div class="iu-drr-forecast-metrics">
        ${iuDrrForecastMetricHtml(
          'Факт ИУ',
          fmt.money(month.fact),
          dayText,
          `Факт выбранного месяца из источника ${forecast.factSourceLabel || 'ИУ'}. Прогнозное умножение здесь не используется.`,
          monthFactTone
        )}
        ${iuDrrForecastMetricHtml(
          monthPlanLabel,
          fmt.money(month.iuPlan),
          month.factCompletion == null ? 'план месяца' : `${fmt.pct(month.factCompletion)} фактом`,
          'Это именно месячный ИУ-план: WB из ИУ, Ozon 40% от договора/Smart.',
          'info'
        )}
        ${iuDrrForecastMetricHtml(
          portalPlanLabel,
          fmt.money(month.portalPlan),
          'по правилу ИУ/корп',
          'Рабочий месячный план портала: если ИУ выше корпоративного плана, берём ИУ; если ниже, берём корпоративный план.',
          'info'
        )}
      </div>
    </div>
  `;
}

function iuDrrForecastPlanPillHtml(plan = {}, forecast = {}) {
  const completion = plan.completion;
  const statusText = iuDrrForecastStatusText(completion);
  const completionText = completion == null ? '—' : fmt.pct(completion);
  const deltaText = iuDrrForecastDeltaText(plan.delta);
  return `
    <div class="iu-drr-forecast-plan-pill">
      <span>${escapeHtml(plan.label || 'Рабочий план')}</span>
      <strong>${fmt.money(plan.plan)}</strong>
      <em>${escapeHtml(statusText)} · ${escapeHtml(completionText)} · ${escapeHtml(deltaText)}</em>
    </div>
  `;
}

function renderIuDrrQuarterForecastPanel(forecast = {}) {
  if (!forecast.available) return '';
  const sourcePlans = (forecast.plans || []).filter((plan) => numberOrZero(plan.plan) > 0);
  const iuPlan = sourcePlans.find((plan) => plan.key === 'iu') || null;
  const visiblePlans = sourcePlans.filter((plan) => {
    if (plan.key !== 'working' || !iuPlan) return true;
    return Math.abs(numberOrZero(plan.plan) - numberOrZero(iuPlan.plan)) > 1;
  });
  const extraPlansHtml = '';
  const showRuleNote = false;
  const primaryPlan = iuPlan || visiblePlans[0] || sourcePlans[0] || {};
  const isYandexForecast = forecast.platformKey === 'ya';
  const forecastTitle = isYandexForecast
    ? `${forecast.platformLabel}: факт ИУ к плану на дату`
    : `${forecast.platformLabel}: факт ИУ к месячному плану`;
  const forecastNote = isYandexForecast
    ? 'Верхняя плашка показывает факт из Я.Маркет против плана к текущей дате. Без прогнозного умножения и без подмешивания WB/Ozon.'
    : 'Верхняя плашка показывает только факт из ИУ/кабинета против месячного ИУ-плана. Без прогнозного умножения. План портала показан отдельной месячной цифрой по правилу ИУ/корп.';
  return `
    <div class="card sku-plan-fact-card iu-drr-quarter-planfact-card" style="${iuDrrPlanFactCardStyle(forecast.platformKey, null)}">
      <div class="section-subhead">
        <div>
          <h3>${escapeHtml(forecastTitle)}</h3>
          <p class="small muted">${escapeHtml(forecastNote)}</p>
        </div>
      </div>

      ${iuDrrQuarterForecastHeroHtml(primaryPlan, forecast)}

      ${extraPlansHtml ? `<div class="iu-drr-forecast-plan-strip">${extraPlansHtml}</div>` : ''}

      ${showRuleNote ? `
        <div class="footer-note">
          <span>Рабочий план портала считается помесячно: берём большее из ИУ и корпоративного плана.</span>
        </div>
      ` : ''}
    </div>
  `;
}

function iuDrrBuildModel(payload = state.iuDrrSummary || {}) {
  const normalized = normalizeIuDrrSummaryPayload(payload);
  const filters = getIuDrrFilters();
  const latestMonth = iuDrrLatestMonth(normalized);
  const selectedMonth = filters.month === 'latest' || !filters.month ? latestMonth : filters.month;
  const selectedPlatform = PORTAL_MARKETPLACE_KEYS_EXTENDED.includes(filters.platform) ? filters.platform : 'wb';
  const selectedPlatformHasCoreSource = PORTAL_MARKETPLACE_CORE_IU_DRR_KEYS.includes(selectedPlatform);
  const quarterSummary = normalized.quarterSummary || normalized.wbQuarter || {};
  const iuDailyRows = normalized.daily.filter((row) => row.monthKey === selectedMonth);
  const ozonFinanceDailyRows = (normalized.ozonFinance?.daily || []).filter((row) => row.monthKey === selectedMonth);
  const dailyRows = !selectedPlatformHasCoreSource
    ? []
    : selectedPlatform === 'ozon' && ozonFinanceDailyRows.length
      ? ozonFinanceDailyRows
      : iuDailyRows;
  const rawMonthSummary = (normalized.months || []).find((month) => month.monthKey === selectedMonth) || {};
  const planTruthMonth = iuDrrPlanTruthMonth(normalized, selectedMonth);
  const wbTruth = planTruthMonth.wb || {};
  const ozonTruth = planTruthMonth.ozon || {};
  const yandexTruthRevenue = numberOrZero(rawMonthSummary.iuRevenueYandexPlan || planTruthMonth.otherChannels?.ya);
  const truthSelectedRevenueTotal = numberOrZero(wbTruth.selectedRevenue) + numberOrZero(ozonTruth.selectedRevenue) + yandexTruthRevenue;
  const truthIuRevenueTotal = numberOrZero(wbTruth.iuPlan) + numberOrZero(ozonTruth.iuPlan40);
  const truthCorporateRevenueTotal = numberOrZero(wbTruth.corporatePlan) + numberOrZero(ozonTruth.corporatePlan) + yandexTruthRevenue;
  const wbRevenueFactToDate = iuDailyRows.reduce((sum, row) => sum + numberOrZero(row.wbApiRevenue || row.iuRevenueWb || row.iuOrdersRevenueWb), 0);
  const wbOrdersRevenueToDate = iuDailyRows.reduce((sum, row) => sum + numberOrZero(row.ordersRevenueWb), 0);
  const wbTargetToDate = iuDailyRows.reduce((sum, row) => sum + numberOrZero(row.iuTargetRevenueWb), 0);
  const wbPlanSpendToDate = iuDailyRows.reduce((sum, row) => sum + numberOrZero(row.iuPlanSpendWb), 0);
  const wbSpendFactToDate = iuDailyRows.reduce((sum, row) => sum + numberOrZero(row.wbApiSpendFact || row.spendFact), 0);
  const wbRevenueDeltaToDate = wbRevenueFactToDate - wbTargetToDate;
  const wbSpendDeltaToDate = wbSpendFactToDate - wbPlanSpendToDate;
  const ozonFinanceMonth = ozonFinanceMonthSummary(normalized.ozonFinance || {}, selectedMonth);
  const ozonPlanMonth = ozonPlanMonthSummary(normalized.ozonPlan || {}, selectedMonth);
  const baseMonthSummary = {
    ...rawMonthSummary,
    iuRevenueWbPlan: iuDrrFirstPositive(rawMonthSummary.iuRevenueWbPlan, wbTruth.selectedRevenue),
    iuRevenueWbIuMin: iuDrrFirstPositive(rawMonthSummary.iuRevenueWbIuMin, wbTruth.iuPlan),
    iuRevenueWbCorporatePlan: iuDrrFirstPositive(rawMonthSummary.iuRevenueWbCorporatePlan, wbTruth.corporatePlan),
    iuRevenueWbPlanSource: iuDrrFirstText(rawMonthSummary.iuRevenueWbPlanSource, wbTruth.source),
    iuRevenueOzonPlan: iuDrrFirstPositive(rawMonthSummary.iuRevenueOzonPlan, ozonTruth.selectedRevenue),
    iuRevenueOzonContractMin: iuDrrFirstPositive(rawMonthSummary.iuRevenueOzonContractMin, ozonTruth.iuPlan40),
    iuRevenueOzonCorporatePlan: iuDrrFirstPositive(rawMonthSummary.iuRevenueOzonCorporatePlan, ozonTruth.corporatePlan),
    iuRevenueOzonPlanSource: iuDrrFirstText(rawMonthSummary.iuRevenueOzonPlanSource, ozonTruth.source),
    iuRevenueYandexPlan: iuDrrFirstPositive(rawMonthSummary.iuRevenueYandexPlan, yandexTruthRevenue),
    iuRevenueYandexCorporatePlan: iuDrrFirstPositive(rawMonthSummary.iuRevenueYandexCorporatePlan, yandexTruthRevenue),
    iuRevenueYandexPlanSource: iuDrrFirstText(rawMonthSummary.iuRevenueYandexPlanSource, yandexTruthRevenue ? 'corporate_plan' : ''),
    iuRevenuePlan: iuDrrFirstPositive(rawMonthSummary.iuRevenuePlan, truthSelectedRevenueTotal),
    iuRevenueIuMin: iuDrrFirstPositive(rawMonthSummary.iuRevenueIuMin, truthIuRevenueTotal),
    iuRevenueCorporatePlan: iuDrrFirstPositive(rawMonthSummary.iuRevenueCorporatePlan, truthCorporateRevenueTotal),
    iuAdsPlan: iuDrrFirstPositive(rawMonthSummary.iuAdsPlan, wbTruth.iuAdsPlan),
    iuAdsOzonPlan: iuDrrFirstPositive(rawMonthSummary.iuAdsOzonPlan, ozonTruth.iuAdsPlan),
    iuAdsTotalPlan: iuDrrFirstPositive(
      rawMonthSummary.iuAdsTotalPlan,
      numberOrZero(wbTruth.iuAdsPlan) + numberOrZero(ozonTruth.iuAdsPlan)
    ),
    iuRevenueWbPlanToDate: wbTargetToDate || rawMonthSummary.iuRevenueWbPlanToDate,
    targetRevenueWb: wbTargetToDate || rawMonthSummary.targetRevenueWb,
    iuRevenueWbFactToDate: wbRevenueFactToDate || rawMonthSummary.iuRevenueWbFactToDate,
    revenueWb: wbRevenueFactToDate || rawMonthSummary.revenueWb,
    ordersRevenueWb: wbOrdersRevenueToDate || rawMonthSummary.ordersRevenueWb,
    revenueWbDelta: wbRevenueFactToDate ? wbRevenueDeltaToDate : rawMonthSummary.revenueWbDelta,
    revenueWbDeltaPct: wbTargetToDate > 0 ? wbRevenueDeltaToDate / wbTargetToDate : rawMonthSummary.revenueWbDeltaPct,
    revenueWbCompletionPct: wbTargetToDate > 0 ? wbRevenueFactToDate / wbTargetToDate : rawMonthSummary.revenueWbCompletionPct,
    iuRevenueWbCompletionToDate: wbTargetToDate > 0 ? wbRevenueFactToDate / wbTargetToDate : rawMonthSummary.iuRevenueWbCompletionToDate,
    iuAdsPlanToDate: wbPlanSpendToDate || rawMonthSummary.iuAdsPlanToDate,
    planSpendWb: wbPlanSpendToDate || rawMonthSummary.planSpendWb,
    iuAdsFactWbToDate: wbSpendFactToDate || rawMonthSummary.iuAdsFactWbToDate,
    spendFact: wbSpendFactToDate || rawMonthSummary.spendFact,
    spendFactDrr: wbSpendFactToDate || rawMonthSummary.spendFactDrr,
    spendDelta: wbRevenueFactToDate ? wbSpendDeltaToDate : rawMonthSummary.spendDelta,
    spendDeltaPct: wbPlanSpendToDate > 0 ? wbSpendDeltaToDate / wbPlanSpendToDate : rawMonthSummary.spendDeltaPct,
    drrWb: wbRevenueFactToDate > 0 ? wbSpendFactToDate / wbRevenueFactToDate : rawMonthSummary.drrWb,
    ordersAdPct: wbOrdersRevenueToDate > 0 ? wbSpendFactToDate / wbOrdersRevenueToDate : rawMonthSummary.ordersAdPct
  };
  const ozonFinanceMonthHasData = ozonFinanceBucketHasValues(ozonFinanceMonth);
  const ozonFinanceRevenueFact = ozonFinanceMonthHasData
    ? (numberOrZero(ozonFinanceMonth.salesGross) + numberOrZero(ozonFinanceMonth.returnsGross)
      || numberOrZero(ozonFinanceMonth.accruedNet))
    : 0;
  const ozonFinanceAdsFact = ozonFinanceMonthHasData ? Math.abs(numberOrZero(ozonFinanceMonth.ads)) : 0;
  const ozonRevenueFactToDate = numberOrZero(baseMonthSummary.iuRevenueOzonFactToDate || baseMonthSummary.revenueOzon)
    || ozonFinanceRevenueFact;
  const ozonAdsFactToDate = numberOrZero(baseMonthSummary.iuAdsFactOzonToDate || baseMonthSummary.spendFactOzon)
    || ozonFinanceAdsFact;
  const ozonPlanRevenueToDate = numberOrZero(baseMonthSummary.iuRevenueOzonPlanToDate || baseMonthSummary.targetRevenueOzon);
  const ozonAdsPlanToDate = numberOrZero(baseMonthSummary.iuAdsOzonPlanToDate || baseMonthSummary.planSpendOzon);
  const monthSummary = selectedPlatform === 'ozon' ? {
    ...baseMonthSummary,
    ozonFinance: ozonFinanceMonth,
    iuRevenueOzonFactToDate: ozonRevenueFactToDate,
    revenueOzon: ozonRevenueFactToDate,
    targetRevenueOzon: ozonPlanRevenueToDate || baseMonthSummary.targetRevenueOzon || baseMonthSummary.iuRevenueOzonPlanToDate,
    revenueOzonDelta: ozonRevenueFactToDate - ozonPlanRevenueToDate,
    revenueOzonDeltaPct: ozonPlanRevenueToDate > 0
      ? (ozonRevenueFactToDate - ozonPlanRevenueToDate) / ozonPlanRevenueToDate
      : null,
    iuRevenueOzonCompletionToDate: ozonPlanRevenueToDate > 0
      ? ozonRevenueFactToDate / ozonPlanRevenueToDate
      : null,
    spendFactOzon: ozonAdsFactToDate,
    iuAdsFactOzonToDate: ozonAdsFactToDate,
    drrOzon: ozonRevenueFactToDate > 0 ? ozonAdsFactToDate / ozonRevenueFactToDate : null,
    spendDeltaOzon: ozonAdsFactToDate - ozonAdsPlanToDate,
    spendDeltaOzonPct: ozonAdsPlanToDate > 0
      ? (ozonAdsFactToDate - ozonAdsPlanToDate) / ozonAdsPlanToDate
      : null
  } : baseMonthSummary;
  const channelRows = (normalized.channels || []).map((channel) => ({
    ...channel,
    spend: numberOrZero(channel.spend)
  })).filter((channel) => channel.spend > 0 || String(channel.source || '').includes('нет источника'));
  return {
    payload: normalized,
    filters,
    latestMonth,
    selectedMonth,
    selectedPlatform,
    quarterSummary,
    monthOptions: iuDrrMonthOptions(normalized),
    dailyRows,
    monthSummary,
    channelRows,
    ozonFinance: normalized.ozonFinance || {},
    ozonFinanceMonth,
    ozonPlanMonth,
    ozonFinanceSkuRows: selectedPlatform === 'ozon'
      ? (normalized.ozonFinance?.sku || []).filter((row) => row.monthKey === selectedMonth || !row.monthKey).slice(0, 60)
      : [],
    hasRows: dailyRows.length > 0
  };
}

function iuDrrToneForDelta(value) {
  const numeric = numberOrZero(value);
  if (numeric <= 0) return 'ok';
  return numeric < 500000 ? 'warn' : 'danger';
}

function iuDrrToneForRevenueDelta(value) {
  const numeric = numberOrZero(value);
  if (numeric >= 0) return 'ok';
  return Math.abs(numeric) < 500000 ? 'warn' : 'danger';
}

function iuDrrPlatformMeta(model) {
  const month = model.monthSummary || {};
  const isOzon = model.selectedPlatform === 'ozon';
  const isYandex = model.selectedPlatform === 'ya';
  const isExtra = !PORTAL_MARKETPLACE_CORE_IU_DRR_KEYS.includes(model.selectedPlatform);
  if (isExtra) {
    const key = PORTAL_MARKETPLACE_KEYS_EXTENDED.includes(model.selectedPlatform) ? model.selectedPlatform : 'wb';
    const label = adsFunnelPlatformLabel(key);
    return {
      key,
      label,
      title: label,
      completion: null,
      fact: 0,
      planToDate: 0,
      targetRevenue: 0,
      revenueDelta: 0,
      revenueDeltaPct: null,
      sparkKey: '',
      tableTargetKey: '',
      tableRevenueKey: '',
      tableDeltaKey: '',
      tableDeltaPctKey: '',
      tableCompletionKey: '',
      adsPlanPct: null,
      adsPlan: 0,
      adsPlanMonth: 0,
      adsFact: 0,
      adsFactPct: null,
      adsCompletion: null,
      adsDelta: null,
      adsDeltaPct: null,
      adsFactSource: 'нет источника IU/DRR по этой площадке'
    };
  }
  const finance = isOzon ? (month.ozonFinance || model.ozonFinanceMonth || {}) : {};
  const ozonPlanToDate = numberOrZero(month.iuRevenueOzonPlanToDate || month.targetRevenueOzon);
  const ozonRevenueFact = numberOrZero(month.iuRevenueOzonFactToDate || month.revenueOzon)
    || numberOrZero(finance.salesGross) + numberOrZero(finance.returnsGross)
    || numberOrZero(finance.accruedNet);
  const ozonAds = Math.abs(numberOrZero(month.spendFactOzon || month.iuAdsFactOzonToDate || finance.ads));
  const yandexPlanToDate = numberOrZero(month.iuRevenueYandexPlanToDate || month.targetRevenueYandex);
  const yandexRevenueFact = numberOrZero(month.iuRevenueYandexFactToDate || month.revenueYandex);
  const yandexAds = numberOrZero(month.spendFactYandex || month.iuAdsFactYandexToDate);
  return {
    key: isYandex ? 'ya' : (isOzon ? 'ozon' : 'wb'),
    label: isYandex ? 'Я.Маркет' : (isOzon ? 'Ozon' : 'WB'),
    title: isYandex ? 'Я.Маркет' : (isOzon ? 'Ozon' : 'WB'),
    completion: isYandex ? month.iuRevenueYandexCompletionToDate : (isOzon ? month.iuRevenueOzonCompletionToDate : month.iuRevenueWbCompletionToDate),
    fact: isYandex ? yandexRevenueFact : (isOzon ? ozonRevenueFact : (month.iuRevenueWbFactToDate || month.revenueWb)),
    planToDate: isYandex ? yandexPlanToDate : (isOzon ? ozonPlanToDate : month.iuRevenueWbPlanToDate),
    targetRevenue: isYandex ? yandexPlanToDate : (isOzon ? ozonPlanToDate : (month.targetRevenueWb || month.iuRevenueWbPlanToDate)),
    revenueDelta: isYandex ? (yandexRevenueFact - yandexPlanToDate) : (isOzon ? (ozonRevenueFact - ozonPlanToDate) : month.revenueWbDelta),
    revenueDeltaPct: isYandex ? month.revenueYandexDeltaPct : (isOzon ? month.revenueOzonDeltaPct : month.revenueWbDeltaPct),
    sparkKey: isYandex ? 'revenueYandex' : (isOzon ? 'accruedNet' : 'iuRevenueWb'),
    tableTargetKey: isYandex ? 'targetRevenueYandex' : (isOzon ? 'targetRevenueOzon' : 'iuTargetRevenueWb'),
    tableRevenueKey: isYandex ? 'revenueYandex' : (isOzon ? 'accruedNet' : 'iuRevenueWb'),
    tableDeltaKey: isYandex ? 'revenueYandexDelta' : (isOzon ? 'revenueOzonDelta' : 'iuRevenueWbDelta'),
    tableDeltaPctKey: isYandex ? 'revenueYandexDeltaPct' : (isOzon ? 'revenueOzonDeltaPct' : 'iuRevenueWbDeltaPct'),
    tableCompletionKey: isYandex ? 'revenueYandexCompletionPct' : (isOzon ? 'revenueOzonCompletionPct' : 'iuRevenueWbCompletionPct'),
    adsPlanPct: isYandex ? null : (isOzon ? month.planPctOzon : month.planPct),
    adsPlan: isYandex ? 0 : (isOzon ? month.iuAdsOzonPlanToDate : month.iuAdsPlanToDate),
    adsPlanMonth: isYandex ? 0 : (isOzon ? month.iuAdsOzonPlan : month.iuAdsPlan),
    adsFact: isYandex ? yandexAds : (isOzon ? ozonAds : month.spendFact),
    adsFactPct: isYandex ? null : (isOzon ? (numberOrZero(finance.salesGross) > 0 ? ozonAds / numberOrZero(finance.salesGross) : month.drrOzon) : month.drrWb),
    adsCompletion: isYandex ? null : (isOzon ? month.iuAdsCompletionOzonToDate : month.iuAdsCompletionToDate),
    adsDelta: isYandex ? null : (isOzon ? month.spendDeltaOzon : month.spendDelta),
    adsDeltaPct: isYandex ? null : (isOzon ? month.spendDeltaOzonPct : month.spendDeltaPct),
    adsFactSource: isYandex ? 'Yandex Market sales funnel: расход рекламы в рублях не передается' : (isOzon ? 'расчетная реклама Ozon; API-факт Ozon Ads не подключен' : 'WB Promotion API без Внешки')
  };
}

function iuDrrSourceBadge(model) {
  const mode = model.payload.source?.adsSourceMode || model.payload.diagnostics?.adsSourceMode || '';
  if (/wb-api/.test(mode)) return badge('WB API', 'ok');
  if (/fixture/.test(mode)) return badge('Excel fixture', 'warn');
  if (mode) return badge(mode, 'warn');
  return badge('нет факта WB', 'danger');
}

function iuDrrSparkline(rows, key, tone = 'ok') {
  const values = rows.map((row) => numberOrZero(row[key]));
  if (!values.some((value) => value > 0 || value < 0)) return '<div class="empty">Нет точек</div>';
  const width = 520;
  const height = 120;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / Math.max(1, values.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 18) - 9;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const color = tone === 'danger' ? '#ef4444' : tone === 'warn' ? '#f59e0b' : '#22c55e';
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(key)}" style="width:100%;height:120px">
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
    </svg>
  `;
}

const IU_DRR_FUNNEL_METRICS_WB = [
  { key: 'planRevenue', label: 'План оборота', formula: 'ИУ / дневная норма', format: 'money', row: 1, keep: true },
  { key: 'factRevenue', label: 'Факт оборота', formula: 'выкупленные продажи WB', format: 'money', row: 2, keep: true },
  { key: 'revenueCompletion', label: 'Выполнение оборота', formula: 'факт / план', format: 'pct', row: 3, keep: true },
  { key: 'revenueDelta', label: 'Отклонение оборота', formula: 'факт - план', format: 'money', row: 4, keep: true },
  { key: 'planAds', label: 'План рекламы', formula: 'план рекламы', format: 'money', row: 5, keep: true },
  { key: 'factAds', label: 'Факт рекламы ДРР', formula: 'WB Promotion без внешки', format: 'money', row: 6, keep: true },
  { key: 'adsCompletion', label: 'Выполнение рекламы', formula: 'факт / план', format: 'pct', row: 7, keep: true },
  { key: 'planDrr', label: 'План ДРР', formula: 'план %', format: 'pct', row: 8, keep: true },
  { key: 'factDrr', label: 'Факт ДРР', formula: 'реклама / оборот', format: 'pct', row: 9, keep: true },
  { key: 'drrDelta', label: 'Отклонение ДРР', formula: 'факт - план', format: 'pctPoint', row: 10, keep: true },
  { key: 'views', label: 'Показы рекламы', formula: 'WB Ads API', format: 'int', row: 11, hideIfEmpty: true },
  { key: 'clicks', label: 'Клики', formula: 'WB Ads API', format: 'int', row: 12, hideIfEmpty: true },
  { key: 'ctr', label: 'CTR', formula: 'клики / показы', format: 'pct', row: 13, hideIfEmpty: true },
  { key: 'cpm', label: 'CPM', formula: 'расход / показы × 1000', format: 'money', row: 14, hideIfEmpty: true },
  { key: 'orders', label: 'Заказы из рекламы', formula: 'WB Ads API', format: 'int', row: 15, hideIfEmpty: true },
  { key: 'cr', label: 'CR в заказ', formula: 'заказы / клики', format: 'pct', row: 16, hideIfEmpty: true },
  { key: 'cpc', label: 'CPC', formula: 'расход / клики', format: 'money', row: 17, hideIfEmpty: true },
  { key: 'cpo', label: 'CPO', formula: 'расход / заказы', format: 'money', row: 18, hideIfEmpty: true },
  { key: 'adRevenue', label: 'Выручка с рекламы', formula: 'атрибуция WB Ads', format: 'money', row: 19, hideIfEmpty: true },
  { key: 'adDrr', label: 'ДРР рекламы', formula: 'расход / выручка рекламы', format: 'pct', row: 20, hideIfEmpty: true },
  { key: 'romi', label: 'ROMI', formula: '(выручка - расход) / расход', format: 'pct', row: 21, hideIfEmpty: true },
  { key: 'revenuePerClick', label: 'Выручка / клик', formula: 'выручка рекламы / клики', format: 'money', row: 22, hideIfEmpty: true },
  { key: 'adAvgOrder', label: 'Средний заказ РК', formula: 'выручка рекламы / заказы', format: 'money', row: 23, hideIfEmpty: true },
  { key: 'revenuePerMille', label: 'Выручка на 1000 показов', formula: 'выручка рекламы / показы', format: 'money', row: 24, hideIfEmpty: true },
  { key: 'orderPerMille', label: 'Заказы на 1000 показов', formula: 'заказы / показы', format: 'num', row: 25, hideIfEmpty: true },
  { key: 'units', label: 'Выкупили, шт', formula: 'факт продаж', format: 'int', row: 26, hideIfEmpty: true },
  { key: 'avgCheck', label: 'Средний чек', formula: 'оборот / выкупы', format: 'money', row: 27, hideIfEmpty: true },
  { key: 'buyoutRate', label: 'Заказы → выкупы', formula: 'выкупы / заказы РК', format: 'pct', row: 28, hideIfEmpty: true },
  { key: 'adsRevenueShare', label: 'Доля выручки РК', formula: 'выручка РК / оборот', format: 'pct', row: 29, hideIfEmpty: true },
  { key: 'totalAds', label: 'Реклама всего', formula: 'ДРР + внешка', format: 'money', row: 30, hideIfEmpty: true },
  { key: 'internalShare', label: 'Доля внутренней РК', formula: 'ДРР / вся реклама', format: 'pct', row: 31, hideIfEmpty: true },
  { key: 'externalAds', label: 'Внешний трафик', formula: 'отдельный контур', format: 'money', row: 32, hideIfEmpty: true },
  { key: 'externalShare', label: 'Доля внешки', formula: 'внешняя / вся реклама', format: 'pct', row: 33, hideIfEmpty: true },
  { key: 'wbPromotion', label: 'WB Продвижение', formula: 'внутренняя реклама', format: 'money', row: 34, hideIfEmpty: true },
  { key: 'promotionShare', label: 'Доля WB Продвижения', formula: 'канал / ДРР', format: 'pct', row: 35, hideIfEmpty: true },
  { key: 'wbMedia', label: 'WB Медиа', formula: 'канал рекламы', format: 'money', row: 36, hideIfEmpty: true },
  { key: 'wbInfluencer', label: 'WB Инфлюенс', formula: 'канал рекламы', format: 'money', row: 37, hideIfEmpty: true },
  { key: 'pvzAds', label: 'Реклама в ПВЗ', formula: 'канал рекламы', format: 'money', row: 38, hideIfEmpty: true },
  { key: 'brandZone', label: 'Брендзона', formula: 'канал рекламы', format: 'money', row: 39, hideIfEmpty: true },
  { key: 'overviews', label: 'Обзоры', formula: 'канал рекламы', format: 'money', row: 40, hideIfEmpty: true },
  { key: 'reviewPoints', label: 'Отзывы за баллы', formula: 'WB API', format: 'money', row: 41, hideIfEmpty: true },
  { key: 'reviewPointsShare', label: 'Доля отзывов', formula: 'отзывы / ДРР', format: 'pct', row: 42, hideIfEmpty: true }
];

const IU_DRR_FUNNEL_METRICS_OZON = [
  { key: 'planGmv', label: 'Smart ИУ-план GMV 40%', formula: 'дневная доля ИУ 40%', format: 'money', row: 1, keep: true },
  { key: 'factGmv', label: 'Smart факт GMV', formula: 'два кабинета / Smart', format: 'money', row: 2, keep: true },
  { key: 'completion', label: 'Выполнение GMV', formula: 'факт / план', format: 'pct', row: 3, keep: true },
  { key: 'gmvDelta', label: 'Отклонение GMV', formula: 'факт - план', format: 'money', row: 4, keep: true },
  { key: 'planAds', label: 'Smart ИУ-план рекламы', formula: 'GMV × ДРР цель', format: 'money', row: 5, keep: true },
  { key: 'factAds', label: 'Smart факт рекламы', formula: 'два кабинета / Smart', format: 'money', row: 6, keep: true },
  { key: 'adsCompletion', label: 'Выполнение рекламы', formula: 'факт / план', format: 'pct', row: 7, keep: true },
  { key: 'adsDelta', label: 'Отклонение рекламы', formula: 'факт - план', format: 'money', row: 8, keep: true },
  { key: 'planDrr', label: 'Цель ДРР', formula: 'ИУ / договор', format: 'pct', row: 9, keep: true },
  { key: 'factDrr', label: 'Факт ДРР', formula: 'реклама / GMV', format: 'pct', row: 10, keep: true },
  { key: 'drrDelta', label: 'Отклонение ДРР', formula: 'факт - цель', format: 'pctPoint', row: 11, keep: true },
  { key: 'noSppBuyouts', label: 'Выкупы без СПП', formula: 'база AdRev KPI', format: 'money', row: 12, keep: true },
  { key: 'noSppDrr', label: 'ДРР без СПП', formula: 'реклама / выкупы без СПП', format: 'pct', row: 13, keep: true },
  { key: 'targetAdsByFact', label: 'Бюджет от факта', formula: 'факт GMV × цель', format: 'money', row: 14, keep: true },
  { key: 'adsReserve', label: 'Резерв рекламы', formula: 'бюджет - факт', format: 'money', row: 15, keep: true },
  { key: 'views', label: 'Показы Ozon Ads', formula: 'Ozon Ads / sheets', format: 'int', row: 16, hideIfEmpty: true },
  { key: 'clicks', label: 'Клики Ozon Ads', formula: 'Ozon Ads / sheets', format: 'int', row: 17, hideIfEmpty: true },
  { key: 'ctr', label: 'CTR', formula: 'клики / показы', format: 'pct', row: 18, hideIfEmpty: true },
  { key: 'cpm', label: 'CPM', formula: 'расход / показы × 1000', format: 'money', row: 19, hideIfEmpty: true },
  { key: 'orders', label: 'Заказы Ozon Ads', formula: 'Ozon Ads / sheets', format: 'int', row: 20, hideIfEmpty: true },
  { key: 'cr', label: 'CR в заказ', formula: 'заказы / клики', format: 'pct', row: 21, hideIfEmpty: true },
  { key: 'cpc', label: 'CPC', formula: 'расход / клики', format: 'money', row: 22, hideIfEmpty: true },
  { key: 'cpo', label: 'CPO', formula: 'расход / заказы', format: 'money', row: 23, hideIfEmpty: true },
  { key: 'adRevenue', label: 'Выручка с рекламы', formula: 'Ozon Ads / sheets', format: 'money', row: 24, hideIfEmpty: true },
  { key: 'adDrr', label: 'ДРР рекламы', formula: 'расход / выручка рекламы', format: 'pct', row: 25, hideIfEmpty: true },
  { key: 'romi', label: 'ROMI', formula: '(выручка - расход) / расход', format: 'pct', row: 26, hideIfEmpty: true },
  { key: 'revenuePerClick', label: 'Выручка / клик', formula: 'выручка рекламы / клики', format: 'money', row: 27, hideIfEmpty: true },
  { key: 'adAvgOrder', label: 'Средний заказ РК', formula: 'выручка рекламы / заказы', format: 'money', row: 28, hideIfEmpty: true },
  { key: 'revenuePerMille', label: 'Выручка на 1000 показов', formula: 'выручка рекламы / показы', format: 'money', row: 29, hideIfEmpty: true },
  { key: 'orderPerMille', label: 'Заказы на 1000 показов', formula: 'заказы / показы', format: 'num', row: 30, hideIfEmpty: true },
  { key: 'marketplaceOrders', label: 'Заказы Ozon, шт', formula: 'заказы площадки', format: 'int', row: 31, hideIfEmpty: true },
  { key: 'units', label: 'Выкупы Ozon, шт', formula: 'выкупы площадки', format: 'int', row: 32, hideIfEmpty: true },
  { key: 'avgCheck', label: 'Средний чек', formula: 'GMV / выкупы', format: 'money', row: 33, hideIfEmpty: true },
  { key: 'buyoutRate', label: 'Заказы → выкупы', formula: 'выкупы / заказы', format: 'pct', row: 34, hideIfEmpty: true },
  { key: 'adsRevenueShare', label: 'Доля выручки РК', formula: 'выручка РК / GMV', format: 'pct', row: 35, hideIfEmpty: true },
  { key: 'smartGmv', label: 'Smart GMV доля', formula: 'наша доля', format: 'money', row: 36, hideIfEmpty: true },
  { key: 'smartGmvShare', label: 'Smart доля GMV', formula: 'Smart / факт GMV', format: 'pct', row: 37, hideIfEmpty: true },
  { key: 'smartAds', label: 'Smart реклама доля', formula: 'наша доля', format: 'money', row: 38, hideIfEmpty: true },
  { key: 'smartAdsShare', label: 'Smart доля рекламы', formula: 'Smart / реклама', format: 'pct', row: 39, hideIfEmpty: true },
  { key: 'financeAds', label: 'Реклама из фин. API', formula: 'Ozon Finance', format: 'money', row: 40, hideIfEmpty: true },
  { key: 'financeSales', label: 'Продажи из фин. API', formula: 'Ozon Finance', format: 'money', row: 41, hideIfEmpty: true },
  { key: 'financeDrr', label: 'ДРР фин. API', formula: 'реклама / продажи API', format: 'pct', row: 42, hideIfEmpty: true },
  { key: 'financeAccrued', label: 'Начислено Ozon', formula: 'Ozon Finance', format: 'money', row: 43, hideIfEmpty: true }
];

const IU_DRR_FUNNEL_METRICS_YANDEX = [
  { key: 'planRevenue', label: 'План оборота', formula: 'company_plan.channels.ya', format: 'money', row: 1, keep: true },
  { key: 'factRevenue', label: 'Факт доставлено', formula: 'Yandex sales funnel delivered', format: 'money', row: 2, keep: true },
  { key: 'ordersRevenue', label: 'Заказано', formula: 'Yandex sales funnel orders', format: 'money', row: 3, keep: true },
  { key: 'revenueCompletion', label: 'Выполнение оборота', formula: 'факт / план', format: 'pct', row: 4, keep: true },
  { key: 'revenueDelta', label: 'Отклонение оборота', formula: 'факт - план', format: 'money', row: 5, keep: true },
  { key: 'orders', label: 'Заказано, шт', formula: 'sales funnel', format: 'int', row: 6, keep: true },
  { key: 'units', label: 'Доставлено, шт', formula: 'sales funnel', format: 'int', row: 7, keep: true },
  { key: 'avgCheck', label: 'Средний чек доставки', formula: 'доставлено ₽ / шт', format: 'money', row: 8, keep: true },
  { key: 'buyoutRate', label: 'Заказы → доставлено', formula: 'доставлено / заказано', format: 'pct', row: 9, keep: true },
  { key: 'views', label: 'Показы', formula: 'sales funnel', format: 'int', row: 10, hideIfEmpty: true },
  { key: 'clicks', label: 'Клики', formula: 'sales funnel', format: 'int', row: 11, hideIfEmpty: true },
  { key: 'ctr', label: 'CTR', formula: 'клики / показы', format: 'pct', row: 12, hideIfEmpty: true },
  { key: 'toCart', label: 'Корзина', formula: 'sales funnel', format: 'int', row: 13, hideIfEmpty: true },
  { key: 'cartRate', label: 'Показ → корзина', formula: 'корзина / показы', format: 'pct', row: 14, hideIfEmpty: true },
  { key: 'orderRate', label: 'Корзина → заказ', formula: 'заказы / корзина', format: 'pct', row: 15, hideIfEmpty: true },
  { key: 'cancellations', label: 'Отмены и невыкупы, шт', formula: 'sales funnel', format: 'int', row: 16, hideIfEmpty: true },
  { key: 'returns', label: 'Возвраты, шт', formula: 'sales funnel', format: 'int', row: 17, hideIfEmpty: true }
];

function iuDrrFunnelRate(numerator, denominator) {
  const base = numberOrZero(denominator);
  return base > 0 ? numberOrZero(numerator) / base : null;
}

function iuDrrFunnelFinite(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function iuDrrFunnelPlatformRgb(platformKey = 'wb') {
  if (platformKey === 'ozon') return [42, 139, 242];
  if (platformKey === 'ya') return [234, 179, 8];
  if (platformKey === 'goldapple') return [91, 188, 114];
  if (platformKey === 'letu') return [219, 106, 169];
  if (platformKey === 'megamarket') return [249, 115, 22];
  if (platformKey === 'samokat') return [16, 185, 129];
  if (platformKey === 'magnit') return [232, 91, 85];
  return [139, 92, 246];
}

function iuDrrFunnelToneRgb(tone = 'info', platformKey = 'wb') {
  if (tone === 'ok') return [34, 197, 94];
  if (tone === 'warn') return [245, 158, 11];
  if (tone === 'danger') return [239, 68, 68];
  return iuDrrFunnelPlatformRgb(platformKey);
}

function iuDrrFunnelMetricValue(metric, row = {}, platformKey = 'wb', context = {}) {
  const key = typeof metric === 'string' ? metric : metric?.key;
  const iuRow = row.iuRow || row;
  if (platformKey === 'ozon') {
    const planGmv = numberOrZero(row.dailyTargetGmv);
    const factGmv = numberOrZero(row.factGmv);
    const planAds = numberOrZero(row.dailyTargetAds);
    const factAds = numberOrZero(row.adsBoth);
    const targetDrr = numberOrZero(context.ozonTargetDrr) || numberOrZero(row.planDrr) || 0.25;
    const views = numberOrZero(iuRow.ozonAdsViews);
    const clicks = numberOrZero(iuRow.ozonAdsClicks);
    const orders = numberOrZero(iuRow.ozonAdsOrders);
    const adRevenue = numberOrZero(iuRow.ozonAdsRevenue);
    const marketplaceOrders = numberOrZero(iuRow.ordersUnitsOzon || row.ordersUnitsOzon || iuRow.unitsOzon || row.unitsOzon);
    const units = numberOrZero(iuRow.deliveredUnitsOzon || row.deliveredUnitsOzon);
    if (key === 'planGmv' || key === 'planRevenue') return planGmv;
    if (key === 'factGmv' || key === 'factRevenue') return factGmv;
    if (key === 'completion' || key === 'revenueCompletion') return iuDrrFunnelRate(factGmv, planGmv);
    if (key === 'gmvDelta' || key === 'revenueDelta') return factGmv - planGmv;
    if (key === 'planAds') return planAds;
    if (key === 'factAds') return factAds;
    if (key === 'adsCompletion') return iuDrrFunnelRate(factAds, planAds);
    if (key === 'adsDelta') return factAds - planAds;
    if (key === 'planDrr') return targetDrr;
    if (key === 'factDrr') return row.drr != null ? row.drr : iuDrrFunnelRate(factAds, factGmv);
    if (key === 'drrDelta') {
      const factDrr = row.drr != null ? row.drr : iuDrrFunnelRate(factAds, factGmv);
      return factDrr == null ? null : factDrr - targetDrr;
    }
    if (key === 'noSppBuyouts') return numberOrZero(row.noSppBuyouts);
    if (key === 'noSppAds') return numberOrZero(row.noSppAds);
    if (key === 'noSppDrr') return row.noSppDrr != null ? row.noSppDrr : iuDrrFunnelRate(row.noSppAds, row.noSppBuyouts);
    if (key === 'targetAdsByFact') return numberOrZero(row.targetAdsByFact);
    if (key === 'adsReserve') return numberOrZero(row.adsReserve);
    if (key === 'views') return views;
    if (key === 'clicks') return clicks;
    if (key === 'orders') return orders;
    if (key === 'adRevenue') return adRevenue;
    if (key === 'ctr') return iuDrrFunnelRate(clicks, views);
    if (key === 'cpm') return views > 0 ? (factAds / views) * 1000 : null;
    if (key === 'cr') return iuDrrFunnelRate(orders, clicks);
    if (key === 'cpc') return iuDrrFunnelRate(factAds, clicks);
    if (key === 'cpo') return iuDrrFunnelRate(factAds, orders);
    if (key === 'romi') return factAds > 0 ? (adRevenue - factAds) / factAds : null;
    if (key === 'adDrr') return iuDrrFunnelRate(factAds, adRevenue);
    if (key === 'revenuePerClick') return iuDrrFunnelRate(adRevenue, clicks);
    if (key === 'adAvgOrder') return iuDrrFunnelRate(adRevenue, orders);
    if (key === 'revenuePerMille') return views > 0 ? (adRevenue / views) * 1000 : null;
    if (key === 'orderPerMille') return views > 0 ? (orders / views) * 1000 : null;
    if (key === 'marketplaceOrders') return marketplaceOrders;
    if (key === 'units') return units;
    if (key === 'avgCheck') return iuDrrFunnelRate(factGmv, units);
    if (key === 'buyoutRate') return iuDrrFunnelRate(units, marketplaceOrders);
    if (key === 'adsRevenueShare') return iuDrrFunnelRate(adRevenue, factGmv);
    if (key === 'smartGmv') return numberOrZero(row.smartGmv || row.smartShareGmv);
    if (key === 'smartGmvShare') return iuDrrFunnelRate(numberOrZero(row.smartGmv || row.smartShareGmv), factGmv);
    if (key === 'smartAds') return numberOrZero(row.smartAds || row.smartShareAds);
    if (key === 'smartAdsShare') return iuDrrFunnelRate(numberOrZero(row.smartAds || row.smartShareAds), factAds);
    if (key === 'financeAds') return numberOrZero(row.financeAds);
    if (key === 'financeSales') return numberOrZero(row.financeSales);
    if (key === 'financeDrr') return iuDrrFunnelRate(row.financeAds, row.financeSales);
    if (key === 'financeAccrued') return numberOrZero(row.financeAccrued);
    return null;
  }

  if (platformKey === 'ya') {
    const planRevenue = numberOrZero(row.targetRevenueYandex);
    const factRevenue = numberOrZero(row.revenueYandex);
    const ordersRevenue = numberOrZero(row.ordersRevenueYandex);
    const orders = numberOrZero(row.ordersUnitsYandex);
    const units = numberOrZero(row.deliveredUnitsYandex || row.unitsYandex);
    const views = numberOrZero(row.yandexShows);
    const clicks = numberOrZero(row.yandexClicks);
    const toCart = numberOrZero(row.yandexToCart);
    const cancellations = numberOrZero(row.yandexCancellationsUnits);
    const returns = numberOrZero(row.yandexReturnsUnits);
    if (key === 'planRevenue') return planRevenue;
    if (key === 'factRevenue') return factRevenue;
    if (key === 'ordersRevenue') return ordersRevenue;
    if (key === 'revenueCompletion' || key === 'completion') return iuDrrFunnelRate(factRevenue, planRevenue);
    if (key === 'revenueDelta') return factRevenue - planRevenue;
    if (key === 'orders') return orders;
    if (key === 'units') return units;
    if (key === 'avgCheck') return iuDrrFunnelRate(factRevenue, units);
    if (key === 'buyoutRate') return iuDrrFunnelRate(units, orders);
    if (key === 'views') return views;
    if (key === 'clicks') return clicks;
    if (key === 'toCart') return toCart;
    if (key === 'ctr') return row.yandexCtr != null ? row.yandexCtr : iuDrrFunnelRate(clicks, views);
    if (key === 'cartRate') return row.yandexCartRate != null ? row.yandexCartRate : iuDrrFunnelRate(toCart, views);
    if (key === 'orderRate') return row.yandexOrderRate != null ? row.yandexOrderRate : iuDrrFunnelRate(orders, toCart);
    if (key === 'cancellations') return cancellations;
    if (key === 'returns') return returns;
    if (key === 'sourceRows') return numberOrZero(row.yandexSourceRows);
    if (['planAds', 'factAds', 'adsCompletion', 'adsDelta', 'planDrr', 'factDrr', 'drrDelta', 'adRevenue', 'romi'].includes(key)) return null;
    return null;
  }

  const planRevenue = numberOrZero(row.iuTargetRevenueWb || row.targetRevenueWb || row.managementTargetRevenueWb || row.contractTargetRevenueWb);
  const factRevenue = numberOrZero(row.wbApiRevenue || row.iuRevenueWb || row.revenueWb || row.adsPctBaseWb || row.ordersRevenueWb);
  const planAds = numberOrZero(row.iuPlanSpendWb || row.planSpendWb || row.managementPlanSpendWb || row.contractMarketingPlanWb);
  const factAds = numberOrZero(row.wbApiSpendFact || row.spendFactDrr || row.spendFact);
  const planDrr = numberOrZero(row.planPct);
  const factDrr = row.factPct != null ? row.factPct : iuDrrFunnelRate(factAds, factRevenue);
  const views = numberOrZero(row.adsViews);
  const clicks = numberOrZero(row.adsClicks);
  const orders = numberOrZero(row.adsOrders);
  const adRevenue = numberOrZero(row.adsRevenue);
  const units = numberOrZero(row.unitsWb);
  const externalAds = numberOrZero(row.externalAds);
  const totalAds = numberOrZero(row.wbApiSpendFact ? factAds + externalAds : row.spendFactTotal || (factAds + externalAds));
  if (key === 'planRevenue') return planRevenue;
  if (key === 'factRevenue') return factRevenue;
  if (key === 'revenueCompletion') return iuDrrFunnelRate(factRevenue, planRevenue);
  if (key === 'revenueDelta') return factRevenue - planRevenue;
  if (key === 'planAds') return planAds;
  if (key === 'factAds') return factAds;
  if (key === 'adsCompletion') return iuDrrFunnelRate(factAds, planAds);
  if (key === 'planDrr') return planDrr;
  if (key === 'factDrr') return factDrr;
  if (key === 'drrDelta') return factDrr == null ? null : factDrr - planDrr;
  if (key === 'views') return views;
  if (key === 'clicks') return clicks;
  if (key === 'orders') return orders;
  if (key === 'adRevenue') return adRevenue;
  if (key === 'ctr') return iuDrrFunnelRate(clicks, views);
  if (key === 'cpm') return views > 0 ? (factAds / views) * 1000 : null;
  if (key === 'cr') return iuDrrFunnelRate(orders, clicks);
  if (key === 'cpc') return iuDrrFunnelRate(factAds, clicks);
  if (key === 'cpo') return iuDrrFunnelRate(factAds, orders);
  if (key === 'romi') return factAds > 0 ? (adRevenue - factAds) / factAds : null;
  if (key === 'adDrr') return iuDrrFunnelRate(factAds, adRevenue);
  if (key === 'revenuePerClick') return iuDrrFunnelRate(adRevenue, clicks);
  if (key === 'adAvgOrder') return iuDrrFunnelRate(adRevenue, orders);
  if (key === 'revenuePerMille') return views > 0 ? (adRevenue / views) * 1000 : null;
  if (key === 'orderPerMille') return views > 0 ? (orders / views) * 1000 : null;
  if (key === 'units') return units;
  if (key === 'avgCheck') return iuDrrFunnelRate(factRevenue, units);
  if (key === 'buyoutRate') return iuDrrFunnelRate(units, orders);
  if (key === 'adsRevenueShare') return iuDrrFunnelRate(adRevenue, factRevenue);
  if (key === 'totalAds') return totalAds;
  if (key === 'internalShare') return iuDrrFunnelRate(factAds, totalAds);
  if (key === 'externalAds') return externalAds;
  if (key === 'externalShare') return iuDrrFunnelRate(externalAds, totalAds);
  if (key === 'wbPromotion') return numberOrZero(row.wbPromotion);
  if (key === 'promotionShare') return iuDrrFunnelRate(row.wbPromotion, factAds);
  if (key === 'wbMedia') return numberOrZero(row.wbMedia);
  if (key === 'wbInfluencer') return numberOrZero(row.wbInfluencer);
  if (key === 'pvzAds') return numberOrZero(row.pvzAds);
  if (key === 'brandZone') return numberOrZero(row.brandZone);
  if (key === 'overviews') return numberOrZero(row.overviews);
  if (key === 'reviewPoints') return numberOrZero(row.reviewPoints);
  if (key === 'reviewPointsShare') return iuDrrFunnelRate(row.reviewPoints, factAds);
  return null;
}

function iuDrrFunnelSummaryValue(metric, rows = [], platformKey = 'wb', context = {}) {
  const key = typeof metric === 'string' ? metric : metric?.key;
  const sum = (metricKey) => rows.reduce((total, row) => total + numberOrZero(iuDrrFunnelMetricValue(metricKey, row, platformKey, context)), 0);
  const planRevenue = sum(platformKey === 'ozon' ? 'planGmv' : 'planRevenue');
  const factRevenue = sum(platformKey === 'ozon' ? 'factGmv' : 'factRevenue');
  const planAds = sum('planAds');
  const factAds = sum('factAds');
  const views = sum('views');
  const clicks = sum('clicks');
  const orders = sum('orders');
  const toCart = sum('toCart');
  const adRevenue = sum('adRevenue');
  const marketplaceOrders = sum('marketplaceOrders');
  const units = sum('units');
  const externalAds = sum('externalAds');
  const totalAds = platformKey === 'ozon' ? factAds : sum('totalAds');
  const smartGmv = sum('smartGmv');
  const smartAds = sum('smartAds');
  const financeAds = sum('financeAds');
  const financeSales = sum('financeSales');
  const targetDrr = platformKey === 'ozon'
    ? (numberOrZero(context.ozonTargetDrr) || iuDrrFunnelRate(planAds, planRevenue))
    : iuDrrFunnelRate(planAds, planRevenue);
  if (key === 'planRevenue' || key === 'planGmv') return planRevenue;
  if (key === 'factRevenue' || key === 'factGmv') return factRevenue;
  if (key === 'revenueCompletion' || key === 'completion') return iuDrrFunnelRate(factRevenue, planRevenue);
  if (key === 'revenueDelta' || key === 'gmvDelta') return factRevenue - planRevenue;
  if (key === 'planAds') return planAds;
  if (key === 'factAds') return factAds;
  if (key === 'adsCompletion') return iuDrrFunnelRate(factAds, planAds);
  if (key === 'adsDelta') return factAds - planAds;
  if (key === 'planDrr') return targetDrr;
  if (key === 'factDrr') return iuDrrFunnelRate(factAds, factRevenue);
  if (key === 'drrDelta') {
    const factDrr = iuDrrFunnelRate(factAds, factRevenue);
    return factDrr == null || targetDrr == null ? null : factDrr - targetDrr;
  }
  if (key === 'views') return views;
  if (key === 'clicks') return clicks;
  if (key === 'orders') return orders;
  if (key === 'adRevenue') return adRevenue;
  if (key === 'ctr') return iuDrrFunnelRate(clicks, views);
  if (key === 'toCart') return toCart;
  if (key === 'cartRate') return iuDrrFunnelRate(toCart, views);
  if (key === 'orderRate') return iuDrrFunnelRate(orders, toCart);
  if (key === 'cpm') return views > 0 ? (factAds / views) * 1000 : null;
  if (key === 'cr') return iuDrrFunnelRate(orders, clicks);
  if (key === 'cpc') return iuDrrFunnelRate(factAds, clicks);
  if (key === 'cpo') return iuDrrFunnelRate(factAds, orders);
  if (key === 'romi') return factAds > 0 ? (adRevenue - factAds) / factAds : null;
  if (key === 'adDrr') return iuDrrFunnelRate(factAds, adRevenue);
  if (key === 'revenuePerClick') return iuDrrFunnelRate(adRevenue, clicks);
  if (key === 'adAvgOrder') return iuDrrFunnelRate(adRevenue, orders);
  if (key === 'revenuePerMille') return views > 0 ? (adRevenue / views) * 1000 : null;
  if (key === 'orderPerMille') return views > 0 ? (orders / views) * 1000 : null;
  if (key === 'marketplaceOrders') return marketplaceOrders;
  if (key === 'units') return units;
  if (key === 'avgCheck') return iuDrrFunnelRate(factRevenue, units);
  if (key === 'buyoutRate') return iuDrrFunnelRate(units, platformKey === 'ozon' ? marketplaceOrders : orders);
  if (key === 'adsRevenueShare') return iuDrrFunnelRate(adRevenue, factRevenue);
  if (key === 'totalAds') return totalAds;
  if (key === 'internalShare') return iuDrrFunnelRate(factAds, totalAds);
  if (key === 'externalShare') return iuDrrFunnelRate(externalAds, totalAds);
  if (key === 'promotionShare') return iuDrrFunnelRate(sum('wbPromotion'), factAds);
  if (key === 'reviewPointsShare') return iuDrrFunnelRate(sum('reviewPoints'), factAds);
  if (key === 'noSppDrr') return iuDrrFunnelRate(sum('noSppAds'), sum('noSppBuyouts'));
  if (key === 'smartGmvShare') return iuDrrFunnelRate(smartGmv, factRevenue);
  if (key === 'smartAdsShare') return iuDrrFunnelRate(smartAds, factAds);
  if (key === 'financeDrr') return iuDrrFunnelRate(financeAds, financeSales);
  return sum(key);
}

function iuDrrFunnelFormat(metric = {}, value) {
  if (!iuDrrFunnelFinite(value)) return '—';
  if (metric.format === 'money') return fmt.money(value);
  if (metric.format === 'int') return fmt.int(value);
  if (metric.format === 'pct') return fmt.pct(value);
  if (metric.format === 'pctPoint') {
    const points = Number(value) * 100;
    return `${points > 0 ? '+' : ''}${fmt.num(points, 1)} п.п.`;
  }
  return fmt.num(value, 1);
}

function iuDrrFunnelCompletionTone(value) {
  if (!iuDrrFunnelFinite(value)) return 'info';
  const numeric = Number(value);
  if (numeric >= 1) return 'ok';
  if (numeric >= 0.9) return 'warn';
  return 'danger';
}

function iuDrrFunnelAdsCompletionTone(value) {
  if (!iuDrrFunnelFinite(value)) return 'info';
  const numeric = Number(value);
  if (numeric <= 1) return 'ok';
  if (numeric <= 1.15) return 'warn';
  return 'danger';
}

function iuDrrAdsBudgetStatus(value) {
  const tone = iuDrrFunnelAdsCompletionTone(value);
  if (tone === 'ok') return 'в бюджете';
  if (tone === 'warn') return 'близко к лимиту';
  if (tone === 'danger') return 'перерасход';
  return 'контроль бюджета';
}

function iuDrrFunnelDrrTone(factDrr, planDrr) {
  if (!iuDrrFunnelFinite(factDrr) || !iuDrrFunnelFinite(planDrr) || Number(planDrr) <= 0) return 'info';
  const ratio = Number(factDrr) / Number(planDrr);
  if (ratio <= 1) return 'ok';
  if (ratio <= 1.15) return 'warn';
  return 'danger';
}

function iuDrrFunnelCellTone(metric = {}, value, row = {}, platformKey = 'wb', context = {}) {
  if (!iuDrrFunnelFinite(value)) return 'info';
  const numeric = Number(value);
  if (['revenueDelta', 'gmvDelta', 'adsReserve'].includes(metric.key)) return numeric >= 0 ? 'ok' : 'danger';
  if (['revenueCompletion', 'completion'].includes(metric.key)) return iuDrrFunnelCompletionTone(numeric);
  if (metric.key === 'adsCompletion') return iuDrrFunnelAdsCompletionTone(numeric);
  if (metric.key === 'adsDelta') return Math.abs(numeric) <= 1 ? 'ok' : 'warn';
  if (metric.key === 'factDrr') return iuDrrFunnelDrrTone(numeric, iuDrrFunnelMetricValue('planDrr', row, platformKey, context));
  if (metric.key === 'adDrr') return numeric <= 0.35 ? 'ok' : (numeric <= 0.5 ? 'warn' : 'danger');
  if (metric.key === 'noSppDrr') return iuDrrFunnelDrrTone(numeric, numberOrZero(context.ozonAdRevKpiRate || context.ozonTargetDrr));
  if (metric.key === 'drrDelta') return numeric <= 0 ? 'ok' : (numeric <= 0.02 ? 'warn' : 'danger');
  if (metric.key === 'romi') return numeric >= 0 ? 'ok' : 'danger';
  if (metric.key === 'buyoutRate') return numeric >= 0.7 ? 'ok' : (numeric >= 0.45 ? 'warn' : 'danger');
  if (metric.key === 'adsRevenueShare') return numeric >= 0.2 ? 'ok' : (numeric >= 0.08 ? 'warn' : 'info');
  if (metric.key === 'externalAds') return numeric > 0 ? 'warn' : 'ok';
  if (metric.key === 'externalShare') return numeric > 0.35 ? 'danger' : (numeric > 0.15 ? 'warn' : 'ok');
  return 'info';
}

function iuDrrFunnelHeatStyle(metric = {}, value, stats = {}, platformKey = 'wb', row = {}, context = {}) {
  if (!iuDrrFunnelFinite(value)) return '';
  const numeric = Number(value);
  const min = Number.isFinite(stats.min) ? stats.min : 0;
  const max = Number.isFinite(stats.max) ? stats.max : 0;
  const spread = Math.max(0.000001, max - min);
  const intensity = max <= min ? (Math.abs(numeric) > 0 ? 0.48 : 0.06) : Math.max(0.04, Math.min(1, (numeric - min) / spread));
  const tone = iuDrrFunnelCellTone(metric, numeric, row, platformKey, context);
  const forcePlatform = ['planRevenue', 'planGmv', 'planAds', 'planDrr', 'views', 'clicks', 'orders', 'marketplaceOrders', 'adRevenue', 'wbPromotion', 'wbMedia', 'wbInfluencer', 'pvzAds', 'brandZone', 'overviews', 'reviewPoints', 'smartGmv', 'smartAds', 'financeAds', 'financeSales', 'financeAccrued', 'targetAdsByFact'].includes(metric.key);
  const rgb = forcePlatform ? iuDrrFunnelPlatformRgb(platformKey) : iuDrrFunnelToneRgb(tone, platformKey);
  const alpha = Math.min(0.78, 0.1 + (intensity * 0.6));
  return `--iu-drr-cell-rgb:${rgb.join(',')};--iu-drr-cell-alpha:${alpha.toFixed(3)}`;
}

function iuDrrFunnelBuildModel(model = {}, context = {}) {
  const platformKey = PORTAL_MARKETPLACE_KEYS_EXTENDED.includes(model.selectedPlatform) ? model.selectedPlatform : 'wb';
  const sourceRows = PORTAL_MARKETPLACE_CORE_IU_DRR_KEYS.includes(platformKey)
    ? (platformKey === 'ozon' ? (context.ozonPlanFactRows || []) : (model.dailyRows || []))
    : [];
  const iuRowsByDate = new Map((model.payload?.daily || [])
    .filter((row) => row.monthKey === model.selectedMonth)
    .map((row) => [row.date, row]));
  const rows = sourceRows.map((row) => ({
    ...row,
    iuRow: iuRowsByDate.get(row.date) || row,
    dateKey: String(row.date || '').slice(0, 10),
    label: row.period || `${String(row.date || '').slice(8, 10)}.${String(row.date || '').slice(5, 7)}`
  })).filter((row) => row.dateKey);
  const baseMetrics = platformKey === 'ozon'
    ? IU_DRR_FUNNEL_METRICS_OZON
    : platformKey === 'ya'
      ? IU_DRR_FUNNEL_METRICS_YANDEX
      : IU_DRR_FUNNEL_METRICS_WB;
  const metrics = baseMetrics.filter((metric) => {
    if (metric.keep || !metric.hideIfEmpty) return true;
    return rows.some((row) => {
      const value = iuDrrFunnelMetricValue(metric, row, platformKey, context);
      return iuDrrFunnelFinite(value) && Math.abs(Number(value)) > 0.000001;
    });
  });
  let metricRows = metrics.map((metric) => {
    const values = rows.map((row) => iuDrrFunnelMetricValue(metric, row, platformKey, context));
    const numeric = values.filter(iuDrrFunnelFinite).map(Number);
    return {
      ...metric,
      values,
      summary: iuDrrFunnelSummaryValue(metric, rows, platformKey, context),
      stats: {
        min: numeric.length ? Math.min(...numeric) : 0,
        max: numeric.length ? Math.max(...numeric) : 0
      }
    };
  });
  const planRevenueKey = platformKey === 'ozon' ? 'planGmv' : 'planRevenue';
  const factRevenueKey = platformKey === 'ozon' ? 'factGmv' : 'factRevenue';
  const planRevenue = iuDrrFunnelSummaryValue(planRevenueKey, rows, platformKey, context);
  const factRevenue = iuDrrFunnelSummaryValue(factRevenueKey, rows, platformKey, context);
  const revenueCompletion = iuDrrFunnelRate(factRevenue, planRevenue);
  const planAds = iuDrrFunnelSummaryValue('planAds', rows, platformKey, context);
  const factAds = iuDrrFunnelSummaryValue('factAds', rows, platformKey, context);
  const adsCompletion = iuDrrFunnelRate(factAds, planAds);
  const planDrr = iuDrrFunnelSummaryValue('planDrr', rows, platformKey, context);
  const factDrr = iuDrrFunnelSummaryValue('factDrr', rows, platformKey, context);
  const views = iuDrrFunnelSummaryValue('views', rows, platformKey, context);
  const clicks = iuDrrFunnelSummaryValue('clicks', rows, platformKey, context);
  const orders = iuDrrFunnelSummaryValue('orders', rows, platformKey, context);
  const adRevenue = iuDrrFunnelSummaryValue('adRevenue', rows, platformKey, context);
  const ctr = iuDrrFunnelRate(clicks, views);
  const cr = iuDrrFunnelRate(orders, clicks);
  const romi = factAds > 0 ? (adRevenue - factAds) / factAds : null;
  const noSppDrr = platformKey === 'ozon' ? iuDrrFunnelSummaryValue('noSppDrr', rows, platformKey, context) : null;
  const reserve = platformKey === 'ozon' ? iuDrrFunnelSummaryValue('adsReserve', rows, platformKey, context) : null;
  const month = model.monthSummary || {};
  const forecastMonth = context.quarterForecast?.month || {};
  const monthPlanRevenue = platformKey === 'ya'
    ? numberOrZero(month.iuRevenueYandexPlanToDate || month.targetRevenueYandex || planRevenue)
    : platformKey === 'ozon'
      ? numberOrZero(forecastMonth.iuPlan || month.iuRevenueOzonContractMin || month.iuRevenueOzonPlan)
      : numberOrZero(forecastMonth.iuPlan || month.iuRevenueWbIuMin || month.iuRevenueWbPlan);
  const monthFactRevenue = platformKey === 'ya'
    ? numberOrZero(forecastMonth.fact || month.iuRevenueYandexFactToDate || month.revenueYandex)
    : platformKey === 'ozon'
      ? numberOrZero(forecastMonth.fact || month.iuRevenueOzonFactToDate || month.revenueOzon)
      : numberOrZero(forecastMonth.fact || month.iuRevenueWbFactToDate || month.revenueWb);
  const monthPlanAds = platformKey === 'ya'
    ? 0
    : platformKey === 'ozon'
      ? numberOrZero(month.iuAdsOzonPlan || month.planSpendOzon)
      : numberOrZero(month.iuAdsPlan || month.planSpendWb);
  const ozonPlanFactLast = platformKey === 'ozon' && Array.isArray(context.ozonPlanFactRows)
    ? context.ozonPlanFactRows.filter((row) => (
      numberOrZero(row.factGmv)
      || numberOrZero(row.factRevenue)
      || numberOrZero(row.adsBoth)
      || numberOrZero(row.cumulativeFactAds)
    )).at(-1) || {}
    : {};
  const monthFactAds = platformKey === 'ya'
    ? 0
    : platformKey === 'ozon'
      ? numberOrZero(ozonPlanFactLast.cumulativeFactAds || month.iuAdsFactOzonToDate || month.spendFactOzon)
      : numberOrZero(month.iuAdsFactWbToDate || month.spendFactDrr || month.spendFact);
  const cardPlanRevenue = monthPlanRevenue || planRevenue;
  const cardFactRevenue = monthFactRevenue || factRevenue;
  const cardRevenueCompletion = iuDrrFunnelRate(cardFactRevenue, cardPlanRevenue);
  const cardPlanAds = monthPlanAds || planAds;
  const cardFactAds = monthFactAds || factAds;
  const cardAdsCompletion = iuDrrFunnelRate(cardFactAds, cardPlanAds);
  const cardPlanDrr = platformKey === 'ya'
    ? null
    : numberOrZero(platformKey === 'ozon' ? month.planPctOzon : month.planPct)
    || (platformKey === 'ozon' ? numberOrZero(context.ozonTargetDrr) : 0)
    || iuDrrFunnelRate(cardPlanAds, cardPlanRevenue)
    || planDrr;
  const cardFactDrr = platformKey === 'ya' ? null : (cardFactRevenue > 0 ? cardFactAds / cardFactRevenue : factDrr);
  const cardReserve = platformKey === 'ozon' ? cardPlanAds - cardFactAds : reserve;
  const cardRevenueDelta = cardFactRevenue - cardPlanRevenue;
  const cardAdsDelta = cardFactAds - cardPlanAds;
  const cardDrrDelta = cardFactDrr == null || cardPlanDrr == null ? null : cardFactDrr - cardPlanDrr;
  const summaryOverrides = {
    [planRevenueKey]: cardPlanRevenue,
    [factRevenueKey]: cardFactRevenue,
    revenueCompletion: cardRevenueCompletion,
    completion: cardRevenueCompletion,
    revenueDelta: cardRevenueDelta,
    gmvDelta: cardRevenueDelta,
    planAds: cardPlanAds,
    factAds: cardFactAds,
    adsCompletion: cardAdsCompletion,
    adsDelta: cardAdsDelta,
    planDrr: cardPlanDrr,
    factDrr: cardFactDrr,
    drrDelta: cardDrrDelta
  };
  metricRows = metricRows.map((metric) => (
    Object.prototype.hasOwnProperty.call(summaryOverrides, metric.key)
      ? { ...metric, summary: summaryOverrides[metric.key] }
      : metric
  ));
  const yandexOrdersRevenue = iuDrrFunnelSummaryValue('ordersRevenue', rows, platformKey, context);
  const yandexOrders = iuDrrFunnelSummaryValue('orders', rows, platformKey, context);
  const yandexUnits = iuDrrFunnelSummaryValue('units', rows, platformKey, context);
  const yandexBuyoutRate = iuDrrFunnelSummaryValue('buyoutRate', rows, platformKey, context);
  const revenueCards = [{
    label: platformKey === 'ya' ? 'Оборот Я.Маркет к плану на дату' : (platformKey === 'ozon' ? 'Smart GMV за месяц' : 'Оборот WB за месяц'),
    value: iuDrrFunnelFormat({ format: 'pct' }, cardRevenueCompletion),
    detail: `${fmt.money(cardFactRevenue)} / ${fmt.money(cardPlanRevenue)}`,
    progress: cardRevenueCompletion,
    tone: iuDrrFunnelCompletionTone(cardRevenueCompletion),
    status: platformKey === 'ya' ? 'план к дате' : 'месячный план'
  }];
  const cards = platformKey === 'ya' ? [
    ...revenueCards,
    { label: 'Заказано', value: iuDrrFunnelFormat({ format: 'money' }, yandexOrdersRevenue), detail: `${fmt.int(yandexOrders)} шт. заказано`, progress: yandexOrdersRevenue > 0 && cardFactRevenue > 0 ? cardFactRevenue / yandexOrdersRevenue : null, tone: 'info' },
    { label: 'Доставлено', value: `${fmt.int(yandexUnits)} шт.`, detail: `к заказам периода ${iuDrrFunnelFormat({ format: 'pct' }, yandexBuyoutRate)}`, progress: null, tone: 'info', status: 'контроль' },
    { label: 'Расход рекламы', value: '—', detail: 'sales funnel API не передает spend', progress: null, tone: 'info' }
  ] : platformKey === 'ozon' ? [
    ...revenueCards,
    { label: 'Smart реклама за месяц', value: iuDrrFunnelFormat({ format: 'pct' }, cardAdsCompletion), detail: `${fmt.money(cardFactAds)} / ${fmt.money(cardPlanAds)}`, progress: cardAdsCompletion, tone: iuDrrFunnelAdsCompletionTone(cardAdsCompletion), status: iuDrrAdsBudgetStatus(cardAdsCompletion) },
    { label: 'ДРР / цель', value: iuDrrFunnelFormat({ format: 'pct' }, cardFactDrr), detail: `цель ${iuDrrFunnelFormat({ format: 'pct' }, cardPlanDrr)}`, progress: cardPlanDrr > 0 ? cardFactDrr / cardPlanDrr : null, tone: iuDrrFunnelDrrTone(cardFactDrr, cardPlanDrr) },
    { label: 'ДРР без СПП', value: iuDrrFunnelFormat({ format: 'pct' }, noSppDrr), detail: `AdRev KPI ${iuDrrFunnelFormat({ format: 'pct' }, context.ozonAdRevKpiRate || context.ozonTargetDrr)}`, progress: noSppDrr && context.ozonAdRevKpiRate ? noSppDrr / context.ozonAdRevKpiRate : null, tone: iuDrrFunnelDrrTone(noSppDrr, context.ozonAdRevKpiRate || context.ozonTargetDrr) },
    { label: 'Резерв рекламы', value: iuDrrFunnelFormat({ format: 'money' }, cardReserve), detail: 'положительный = можно добирать', progress: cardReserve != null && cardFactAds + cardReserve > 0 ? cardReserve / (cardFactAds + cardReserve) : null, tone: cardReserve >= 0 ? 'ok' : 'warn' },
    { label: 'Воронка Ads', value: iuDrrFunnelFormat({ format: 'pct' }, ctr), detail: `${fmt.int(clicks)} кликов / ${fmt.int(views)} показов`, progress: ctr ? Math.min(1, ctr / 0.02) : null, tone: ctr ? 'ok' : 'info' }
  ] : [
    ...revenueCards,
    { label: 'Реклама ДРР за месяц', value: iuDrrFunnelFormat({ format: 'pct' }, cardAdsCompletion), detail: `${fmt.money(cardFactAds)} / ${fmt.money(cardPlanAds)}`, progress: cardAdsCompletion, tone: iuDrrFunnelAdsCompletionTone(cardAdsCompletion), status: iuDrrAdsBudgetStatus(cardAdsCompletion) },
    { label: 'ДРР факт', value: iuDrrFunnelFormat({ format: 'pct' }, cardFactDrr), detail: `план ${iuDrrFunnelFormat({ format: 'pct' }, cardPlanDrr)}`, progress: cardPlanDrr > 0 ? cardFactDrr / cardPlanDrr : null, tone: iuDrrFunnelDrrTone(cardFactDrr, cardPlanDrr) },
    { label: 'Внешний трафик', value: iuDrrFunnelFormat({ format: 'money' }, iuDrrFunnelSummaryValue('externalAds', rows, platformKey, context)), detail: 'отдельно, не в ДРР', progress: null, tone: iuDrrFunnelSummaryValue('externalAds', rows, platformKey, context) > 0 ? 'warn' : 'ok' },
    { label: 'CTR / CR', value: iuDrrFunnelFormat({ format: 'pct' }, ctr), detail: `CR ${iuDrrFunnelFormat({ format: 'pct' }, cr)}`, progress: ctr ? Math.min(1, ctr / 0.02) : null, tone: ctr ? 'ok' : 'info' },
    { label: 'ROMI Ads', value: iuDrrFunnelFormat({ format: 'pct' }, romi), detail: `${fmt.money(adRevenue)} выручки рекламы`, progress: romi != null ? Math.min(1, Math.max(0, romi / 2)) : null, tone: romi == null ? 'info' : (romi >= 0 ? 'ok' : 'danger') }
  ];
  return {
    platformKey,
    platformLabel: platformKey === 'ya' ? 'Я.Маркет' : (platformKey === 'ozon' ? 'Ozon' : 'WB'),
    rows,
    metricRows,
    cards,
    note: platformKey === 'ya'
      ? 'Я.Маркет берется из sales funnel API: оборот и штуки считаем по delivered, заказанный оборот оставляем как контроль; рекламный spend этот источник не передает.'
      : platformKey === 'ozon'
        ? 'Ozon сверяется по Smart-доле 40%, двум кабинетам, GMV, рекламе и ДРР без СПП.'
        : 'WB показывает внутреннюю рекламу отдельно от внешнего трафика: внешка не попадает в ДРР и дельту ИУ.'
  };
}

function iuDrrScoreStatusLabel(tone = 'info') {
  if (tone === 'ok') return 'в плане';
  if (tone === 'warn') return 'зона внимания';
  if (tone === 'danger') return 'не в плане';
  return 'контроль';
}

function iuDrrScoreMarks(card = {}) {
  if (Array.isArray(card.marks) && card.marks.length) {
    return card.marks.slice(0, 4).map((mark) => String(mark || '—'));
  }
  const progress = iuDrrFunnelFinite(card.progress) ? Number(card.progress) : null;
  const value = card.value == null || card.value === '' ? '—' : String(card.value);
  if (progress == null) return ['80%', '90%', value, '100%'];
  return [
    '80%',
    '90%',
    value,
    progress >= 1 ? '100%+' : '100%'
  ];
}

function iuDrrScoreCardHtml(card = {}, extraClass = '') {
  const tone = ['ok', 'warn', 'danger', 'info'].includes(card.tone) ? card.tone : 'info';
  const progress = iuDrrFunnelFinite(card.progress) ? Math.max(0, Math.min(1.35, Number(card.progress))) : 0;
  const progressWidth = Math.min(100, progress * 100).toFixed(1);
  const marks = iuDrrScoreMarks(card).map((mark) => `<span>${escapeHtml(mark)}</span>`).join('');
  const value = card.value == null || card.value === '' ? '—' : String(card.value);
  const label = card.label == null || card.label === '' ? 'Показатель' : String(card.label);
  const status = card.status || iuDrrScoreStatusLabel(tone);
  return `
    <div class="iu-drr-funnel-card iu-drr-score-card ${escapeHtml(tone)} ${escapeHtml(extraClass)}" style="--iu-drr-progress:${progressWidth}%">
      <div class="iu-drr-score-head">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
      <div class="iu-drr-score-track">
        <i></i>
        <em>${escapeHtml(value)}</em>
      </div>
      <div class="iu-drr-score-marks">${marks}</div>
      <div class="iu-drr-score-foot">
        <b>${escapeHtml(status)}</b>
        <span>${escapeHtml(card.detail || '')}</span>
      </div>
    </div>
  `;
}

function renderIuDrrFunnelPanel(funnel = {}, context = {}) {
  const rows = funnel.rows || [];
  const metricRows = funnel.metricRows || [];
  if (!rows.length || !metricRows.length) return '';
  const platformTone = funnel.platformKey === 'ozon' ? 'info' : 'warn';
  const cardsHtml = (funnel.cards || []).map((card) => iuDrrScoreCardHtml(card)).join('');
  const dateHeaders = rows.map((row) => `
    <th class="iu-drr-date-col">
      <span>${escapeHtml(row.label || row.period || '')}</span>
      <small>${escapeHtml(row.dateKey || '')}</small>
    </th>
  `).join('');
  const bodyRows = metricRows.map((metric) => `
    <tr>
      <td class="iu-drr-sticky iu-drr-col-index">${fmt.int(metric.row)}</td>
      <td class="iu-drr-sticky iu-drr-col-metric">
        <strong>${escapeHtml(metric.label)}</strong>
      </td>
      <td class="iu-drr-sticky iu-drr-col-formula">${escapeHtml(metric.formula || '')}</td>
      <td class="iu-drr-sticky iu-drr-col-summary">${iuDrrFunnelFormat(metric, metric.summary)}</td>
      ${rows.map((row, index) => {
        const value = metric.values[index];
        const tone = iuDrrFunnelCellTone(metric, value, row, funnel.platformKey, context);
        const style = iuDrrFunnelHeatStyle(metric, value, metric.stats, funnel.platformKey, row, context);
        return `<td class="iu-drr-heat-cell ${escapeHtml(tone)}" style="${escapeHtml(style)}">${iuDrrFunnelFormat(metric, value)}</td>`;
      }).join('')}
    </tr>
  `).join('');
  return `
    <div class="iu-drr-funnel-panel" style="--iu-drr-platform-rgb:${iuDrrFunnelPlatformRgb(funnel.platformKey).join(',')};--iu-drr-days:${Math.max(1, rows.length)}">
      <div class="section-subhead">
        <div>
          <h3>Рекламная воронка и ИУ по дням</h3>
          <p class="small muted">${escapeHtml(funnel.note || '')}</p>
        </div>
        <div class="badge-stack">
          ${badge(funnel.platformLabel || 'ИУ', platformTone)}
          ${badge(`${fmt.int(metricRows.length)} метрик`, 'info')}
          ${badge(`${fmt.int(rows.length)} дней`, rows.length ? 'ok' : 'warn')}
        </div>
      </div>
      <div class="iu-drr-funnel-cards">${cardsHtml}</div>
      <div class="iu-drr-funnel-table-wrap">
        <table class="iu-drr-funnel-heatmap">
          <thead>
            <tr>
              <th class="iu-drr-sticky iu-drr-col-index">№</th>
              <th class="iu-drr-sticky iu-drr-col-metric">Метрика</th>
              <th class="iu-drr-sticky iu-drr-col-formula">Расчет</th>
              <th class="iu-drr-sticky iu-drr-col-summary">Итого</th>
              ${dateHeaders}
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function ozonPlanFactDailyRows(model, context = {}) {
  const selectedMonth = model.selectedMonth || '';
  const planRows = (model.payload.ozonPlan?.daily || []).filter((row) => row.monthKey === selectedMonth);
  const activePlanRows = planRows.filter((row) => numberOrZero(row.revenue) || numberOrZero(row.gmv) || numberOrZero(row.ads));
  const financeRows = [
    ...(model.ozonFinance?.daily || []),
    ...(model.payload?.ozonFinance?.daily || [])
  ].filter((row, index, rows) => (
    row?.monthKey === selectedMonth
    && rows.findIndex((candidate) => candidate?.date === row?.date) === index
  ));
  const financeByDate = new Map(financeRows.map((row) => [row.date, row]));
  const iuDailyRows = (model.payload?.daily || []).filter((row) => (
    row?.monthKey === selectedMonth
    && (
      numberOrZero(row.revenueOzon)
      || numberOrZero(row.iuRevenueOzon)
      || numberOrZero(row.iuRevenueOzonFactToDate)
      || numberOrZero(row.ordersRevenueOzon)
      || numberOrZero(row.spendFactOzon)
      || numberOrZero(row.iuAdsFactOzonToDate)
    )
  ));
  const iuDailyByDate = new Map(iuDailyRows.map((row) => [row.date, row]));
  const dates = [...new Set([
    ...activePlanRows.map((row) => row.date),
    ...financeRows.map((row) => row.date),
    ...iuDailyRows.map((row) => row.date)
  ].filter(Boolean))].sort();
  const monthTargetGmv = numberOrZero(context.monthTargetGmv);
  const targetDrr = numberOrZero(context.targetDrr || 0.25);
  const smartShare = numberOrZero(context.smartShare || 0.4);
  const daysInMonth = daysInMonthKey(selectedMonth);
  const dailyTargetGmv = daysInMonth > 0 ? monthTargetGmv / daysInMonth : 0;
  const dailyTargetAds = dailyTargetGmv * targetDrr;
  let cumulativeTargetGmv = 0;
  let cumulativeFactGmv = 0;
  let cumulativeNoSppBuyouts = 0;
  let cumulativeNoSppBuyoutsFact = 0;
  let cumulativeTargetAds = 0;
  let cumulativeFactAds = 0;
  let cumulativeNoSppAds = 0;
  return dates.map((date) => {
    const rows = activePlanRows.filter((row) => row.date === date);
    const total = rows.reduce((sum, row) => {
      sum.revenue += numberOrZero(row.revenue);
      sum.gmv += numberOrZero(row.gmv);
      sum.ads += numberOrZero(row.ads);
      sum.deltaToTargetSpend += numberOrZero(row.deltaToTargetSpend);
      sum.cumulativeAds += numberOrZero(row.cumulativeAds);
      sum.forecastDailyAds += numberOrZero(row.forecastDailyAds);
      return sum;
    }, { revenue: 0, gmv: 0, ads: 0, deltaToTargetSpend: 0, cumulativeAds: 0, forecastDailyAds: 0 });
    const accountBreakdown = {};
    for (const row of rows) {
      for (const [key, source] of Object.entries(row.accountBreakdown || {})) {
        if (!key || !source) continue;
        const target = accountBreakdown[key] || {
          revenue: 0,
          gmv: 0,
          ads: 0,
          label: source.label || key
        };
        target.revenue += numberOrZero(source.revenue);
        target.gmv += numberOrZero(source.gmv);
        target.ads += numberOrZero(source.ads);
        target.deltaToTargetSpend = numberOrZero(target.deltaToTargetSpend) + numberOrZero(source.deltaToTargetSpend);
        target.cumulativeAds = numberOrZero(source.cumulativeAds) || numberOrZero(target.cumulativeAds);
        target.forecastDailyAds = numberOrZero(target.forecastDailyAds) + numberOrZero(source.forecastDailyAds);
        target.label = source.label || target.label;
        accountBreakdown[key] = target;
      }
    }
    const finance = financeByDate.get(date) || {};
    const iuDaily = iuDailyByDate.get(date) || {};
    const primary = accountBreakdown.primary || {};
    const smart = accountBreakdown.smart || {};
    const smartRevenue = numberOrZero(smart.revenue);
    const smartGmv = numberOrZero(smart.gmv);
    const smartAds = numberOrZero(smart.ads);
    const financeAds = Math.abs(numberOrZero(finance.ads));
    const financeRealization = numberOrZero(finance.realizationSalesGross)
      || numberOrZero(finance.realizationRevenue) + numberOrZero(finance.discountBonus) + numberOrZero(finance.partnerPrograms);
    const financeSalesNet = numberOrZero(finance.salesGross) + numberOrZero(finance.returnsGross);
    const financeFactGmv = financeRealization || financeSalesNet;
    const iuRevenueOzon = numberOrZero(
      iuDaily.revenueOzon
      || iuDaily.iuRevenueOzon
      || iuDaily.iuRevenueOzonFactToDate
      || iuDaily.ordersRevenueOzon
    );
    const iuAdsOzon = numberOrZero(iuDaily.spendFactOzon || iuDaily.iuAdsFactOzonToDate);
    const hasDashboardFact = rows.some((row) => numberOrZero(row.revenue) || numberOrZero(row.gmv) || numberOrZero(row.ads));
    const hasFinanceFact = numberOrZero(finance.rowCount) > 0 || financeFactGmv > 0 || financeAds > 0;
    const hasIuDailyFact = iuRevenueOzon > 0 || iuAdsOzon > 0;
    const usesFinanceFallback = !hasDashboardFact && hasFinanceFact;
    const usesIuDailyFallback = !hasDashboardFact && !hasFinanceFact && hasIuDailyFact;
    const isPartialFinanceDay = usesFinanceFallback && !financeRealization;
    const factGmv = smartRevenue || numberOrZero(total.revenue) || iuRevenueOzon || financeFactGmv;
    const factAds = smartAds || numberOrZero(total.ads) || iuAdsOzon || financeAds;
    const noSppBuyouts = numberOrZero(finance.realizationSalesGross)
      || numberOrZero(finance.realizationRevenue) + numberOrZero(finance.discountBonus) + numberOrZero(finance.partnerPrograms)
      || financeSalesNet
      || iuRevenueOzon
      || smartGmv
      || numberOrZero(total.gmv);
    const noSppBuyoutsFact = financeFactGmv;
    const noSppAds = financeAds || factAds;
    const countsTowardCumulative = !isPartialFinanceDay;
    const cumulativeDailyTargetGmv = countsTowardCumulative ? dailyTargetGmv : 0;
    const cumulativeDailyFactGmv = countsTowardCumulative ? factGmv : 0;
    const cumulativeDailyNoSppBuyouts = countsTowardCumulative ? noSppBuyouts : 0;
    const cumulativeDailyNoSppBuyoutsFact = countsTowardCumulative ? noSppBuyoutsFact : 0;
    const cumulativeDailyTargetAds = countsTowardCumulative ? dailyTargetAds : 0;
    const cumulativeDailyFactAds = countsTowardCumulative ? factAds : 0;
    const cumulativeDailyNoSppAds = countsTowardCumulative ? noSppAds : 0;
    cumulativeTargetGmv += cumulativeDailyTargetGmv;
    cumulativeFactGmv += cumulativeDailyFactGmv;
    cumulativeNoSppBuyouts += cumulativeDailyNoSppBuyouts;
    cumulativeNoSppBuyoutsFact += cumulativeDailyNoSppBuyoutsFact;
    cumulativeTargetAds += cumulativeDailyTargetAds;
    cumulativeFactAds += cumulativeDailyFactAds;
    cumulativeNoSppAds += cumulativeDailyNoSppAds;
    return {
      date,
      period: `${String(date).slice(8, 10)}.${String(date).slice(5, 7)}`,
      dailyTargetGmv,
      factGmv,
      factRevenue: factGmv,
      noSppBuyouts,
      noSppBuyoutsFact,
      totalRevenue: numberOrZero(total.revenue),
      totalGmv: numberOrZero(total.gmv),
      totalAds: numberOrZero(total.ads),
      planDeltaGmv: factGmv - dailyTargetGmv,
      completion: dailyTargetGmv > 0 ? factGmv / dailyTargetGmv : null,
      cumulativeTargetGmv,
      cumulativeFactGmv,
      cumulativeNoSppBuyouts,
      cumulativeNoSppBuyoutsFact,
      cumulativeGmvDelta: cumulativeFactGmv - cumulativeTargetGmv,
      cumulativeGmvCompletion: cumulativeTargetGmv > 0 ? cumulativeFactGmv / cumulativeTargetGmv : null,
      dailyTargetAds,
      adsBoth: factAds,
      noSppAds,
      adsDeltaDaily: factAds - dailyTargetAds,
      cumulativeTargetAds,
      cumulativeFactAds,
      cumulativeNoSppAds,
      noSppDrr: noSppBuyouts > 0 ? noSppAds / noSppBuyouts : null,
      cumulativeNoSppDrr: cumulativeNoSppBuyouts > 0 ? cumulativeNoSppAds / cumulativeNoSppBuyouts : null,
      cumulativeAdsDelta: cumulativeFactAds - cumulativeTargetAds,
      cumulativeAdsCompletion: cumulativeTargetAds > 0 ? cumulativeFactAds / cumulativeTargetAds : null,
      targetAdsByFact: factGmv * targetDrr,
      adsReserve: factGmv * targetDrr - factAds,
      dashboardAdsDelta: numberOrZero(smart.deltaToTargetSpend || total.deltaToTargetSpend),
      dashboardCumulativeAds: numberOrZero(smart.cumulativeAds || total.cumulativeAds),
      forecastDailyAds: numberOrZero(smart.forecastDailyAds || total.forecastDailyAds),
      drr: factGmv > 0 ? factAds / factGmv : null,
      primaryRevenue: numberOrZero(primary.revenue),
      primaryGmv: numberOrZero(primary.gmv),
      primaryAds: numberOrZero(primary.ads),
      smartRevenue,
      smartGmv,
      smartAds,
      smartDrrRevenue: smartRevenue > 0 ? smartAds / smartRevenue : null,
      smartDrrGmv: smartGmv > 0 ? smartAds / smartGmv : null,
      smartShareAds: smartAds || factAds * smartShare,
      smartShareGmv: smartGmv || factGmv * smartShare,
      ordersUnitsOzon: Math.round(numberOrZero(iuDaily.ordersUnitsOzon || iuDaily.unitsOzon)),
      deliveredUnitsOzon: Math.round(numberOrZero(iuDaily.deliveredUnitsOzon)),
      financeAccrued: numberOrZero(finance.accruedNet),
      financeSales: numberOrZero(finance.salesGross),
      financeRealizationRevenue: numberOrZero(finance.realizationRevenue),
      financeDiscountBonus: numberOrZero(finance.discountBonus),
      financePartnerPrograms: numberOrZero(finance.partnerPrograms),
      financeAds: Math.abs(numberOrZero(finance.ads)),
      source: usesFinanceFallback ? 'ozon_finance_api' : (hasDashboardFact ? 'ozon_dashboard' : (usesIuDailyFallback ? 'iu_drr_daily' : 'missing')),
      sourceLabel: usesFinanceFallback ? 'Ozon Finance API' : (hasDashboardFact ? 'Ozon dashboard' : (usesIuDailyFallback ? 'IU/DRR daily' : '')),
      isPartial: Boolean(isPartialFinanceDay || usesIuDailyFallback),
      countsTowardCumulative
    };
  });
}

function ozonPlanFactMonthTargetGmv(model, planMonth = null) {
  const month = model?.monthSummary || {};
  const selectedPlan = numberOrZero(month.iuRevenueOzonPlan);
  if (selectedPlan > 0) return selectedPlan;
  const contractMin = numberOrZero(month.iuRevenueOzonContractMin);
  const corporatePlan = numberOrZero(month.iuRevenueOzonCorporatePlan);
  if (contractMin > 0 || corporatePlan > 0) return Math.max(contractMin, corporatePlan);
  const ozonPlan = model?.payload?.ozonPlan || {};
  const sourceMonth = planMonth || model?.ozonPlanMonth || ozonPlanMonthSummary(ozonPlan, model?.selectedMonth);
  const rawMonthlyTarget = numberOrZero(sourceMonth?.monthlyTargetGmv || ozonPlan.monthlyTargets?.[model?.selectedMonth]);
  const smartShare = numberOrZero(sourceMonth?.allocation?.smartShare || ozonPlan.allocation?.smartShare || 0.4);
  return rawMonthlyTarget * smartShare;
}

function iuDrrOzonPlanFactContext(model, overrides = {}) {
  const ozonPlan = model?.payload?.ozonPlan || {};
  const planMonth = model?.ozonPlanMonth || ozonPlanMonthSummary(ozonPlan, model?.selectedMonth);
  const allocation = planMonth?.allocation || {};
  const totals = planMonth?.totals || {};
  const targetDrr = numberOrZero(overrides.targetDrr)
    || numberOrZero(model?.monthSummary?.planPctOzon)
    || numberOrZero(totals.targetDrr)
    || numberOrZero((ozonPlan.accounts || []).find((account) => account.key === 'smart')?.targetDrr)
    || 0.25;
  const smartShare = numberOrZero(overrides.smartShare || allocation.smartShare || 0.4);
  const monthTargetGmv = numberOrZero(overrides.monthTargetGmv) || ozonPlanFactMonthTargetGmv(model, planMonth);
  const ozonPlanFactRows = Array.isArray(overrides.ozonPlanFactRows)
    ? overrides.ozonPlanFactRows
    : ozonPlanFactDailyRows(model, { monthTargetGmv, smartShare, targetDrr });
  return {
    monthTargetGmv,
    smartShare,
    targetDrr,
    ozonPlanFactRows,
    rows: ozonPlanFactRows
  };
}

function renderOzonIuAccountCards(model, context = {}) {
  const planMonth = model.ozonPlanMonth || {};
  const totals = planMonth.totals || {};
  const allocation = planMonth.allocation || {};
  const smartShare = numberOrZero(context.smartShare || allocation.smartShare || 0.4);
  const targetDrr = numberOrZero(context.targetDrr || planMonth.totals?.targetDrr || 0.25);
  const drr = numberOrZero(totals.gmv) > 0 ? numberOrZero(totals.ads) / numberOrZero(totals.gmv) : totals.drrGmv;
  return `
    <div class="dashboard-grid-3" style="margin-top:14px">
      <div class="mini-kpi ${drr != null && drr <= targetDrr ? 'ok' : 'warn'}">
        <span>ИУ общий контур</span>
        <strong>${fmt.money(totals.ads)}</strong>
        <span>GMV ${fmt.money(totals.gmv)} · ДРР ${drr != null ? fmt.pct(drr) : '—'}</span>
      </div>
      <div class="mini-kpi ok">
        <span>Наша доля Smart ${fmt.pct(smartShare)}</span>
        <strong>${fmt.money(allocation.smartAllocatedAds)}</strong>
        <span>GMV доля ${fmt.money(allocation.smartAllocatedGmv)}</span>
      </div>
    </div>
  `;
}

function renderOzonIuPlanFactTable(model, context = {}) {
  const rows = Array.isArray(context.rows) ? context.rows : ozonPlanFactDailyRows(model, context);
  const last = rows[rows.length - 1] || {};
  const targetDrr = numberOrZero(context.targetDrr || 0.25);
  const planGmvToDate = numberOrZero(last.cumulativeTargetGmv);
  const factGmvToDate = numberOrZero(last.cumulativeFactGmv);
  const gmvCompletion = planGmvToDate > 0 ? factGmvToDate / planGmvToDate : null;
  const planAdsToDate = numberOrZero(last.cumulativeTargetAds);
  const factAdsToDate = numberOrZero(last.cumulativeFactAds);
  const adsCompletion = planAdsToDate > 0 ? factAdsToDate / planAdsToDate : null;
  const drrToDate = factGmvToDate > 0 ? factAdsToDate / factGmvToDate : null;
  const noSppDrrToDate = last.cumulativeNoSppDrr;
  const reserveToDate = numberOrZero(last.adsReserve);
  const gameCards = [
    {
      label: 'Smart GMV к плану портала',
      value: gmvCompletion == null ? '—' : fmt.pct(gmvCompletion),
      detail: `${fmt.money(factGmvToDate)} / ${fmt.money(planGmvToDate)}`,
      progress: gmvCompletion,
      tone: iuDrrFunnelCompletionTone(gmvCompletion)
    },
    {
      label: 'Smart реклама к плану',
      value: adsCompletion == null ? '—' : fmt.pct(adsCompletion),
      detail: `${fmt.money(factAdsToDate)} / ${fmt.money(planAdsToDate)}`,
      progress: adsCompletion,
      tone: iuDrrFunnelAdsCompletionTone(adsCompletion),
      status: iuDrrAdsBudgetStatus(adsCompletion)
    },
    {
      label: 'ДРР факт',
      value: drrToDate == null ? '—' : fmt.pct(drrToDate),
      detail: `цель ${fmt.pct(targetDrr)}`,
      progress: targetDrr > 0 && drrToDate != null ? drrToDate / targetDrr : null,
      tone: iuDrrFunnelDrrTone(drrToDate, targetDrr)
    },
    {
      label: 'ДРР без СПП',
      value: noSppDrrToDate == null ? '—' : fmt.pct(noSppDrrToDate),
      detail: `база ${fmt.money(last.cumulativeNoSppBuyouts)} · API факт ${numberOrZero(last.cumulativeNoSppBuyoutsFact) ? fmt.money(last.cumulativeNoSppBuyoutsFact) : '—'}`,
      progress: targetDrr > 0 && noSppDrrToDate != null ? noSppDrrToDate / targetDrr : null,
      tone: iuDrrFunnelDrrTone(noSppDrrToDate, targetDrr)
    },
    {
      label: 'Отклонение к плану портала',
      value: fmt.money(numberOrZero(last.cumulativeGmvDelta)),
      detail: gmvCompletion == null ? 'нет плана' : fmt.pct(gmvCompletion),
      progress: gmvCompletion,
      tone: iuDrrToneForRevenueDelta(last.cumulativeGmvDelta)
    },
    {
      label: 'Резерв РК по ДРР',
      value: fmt.money(reserveToDate),
      detail: reserveToDate >= 0 ? 'можно добирать' : 'перерасход',
      progress: reserveToDate >= 0 && factAdsToDate + reserveToDate > 0 ? reserveToDate / (factAdsToDate + reserveToDate) : null,
      tone: reserveToDate >= 0 ? 'ok' : 'warn'
    }
  ];
  const progressCell = (value, tone = 'info') => {
    const progress = iuDrrFunnelFinite(value) ? Math.max(0, Math.min(1.35, Number(value))) : 0;
    return `
      <div class="iu-drr-progress-cell ${escapeHtml(tone)}" style="--iu-drr-progress:${Math.min(100, progress * 100).toFixed(1)}%">
        <strong>${value == null ? '—' : fmt.pct(value)}</strong>
        <span><i></i></span>
      </div>
    `;
  };
  return `
    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Форма ИУ Ozon: план-факт</h3>
          <p class="small muted">Smart 40%: план, факт, выполнение и ДРР по дням.</p>
        </div>
        ${badge(rows.length ? `${fmt.int(rows.length)} дней` : 'нет строк', rows.length ? 'ok' : 'warn')}
      </div>
      <div class="iu-drr-funnel-cards iu-drr-ozon-plan-cards">${gameCards.map((card) => iuDrrScoreCardHtml(card, 'iu-drr-score-card--ozon')).join('')}</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Smart план / день</th>
              <th>Smart факт / день</th>
              <th>Выкупы без СПП / день</th>
              <th>Факт выкупов без СПП / день</th>
              <th>Smart план накоп.</th>
              <th>Smart факт накоп.</th>
              <th>Выкупы без СПП накоп.</th>
              <th>Δ Smart накоп.</th>
              <th>Smart реклама план / день</th>
              <th>Smart реклама факт / день</th>
              <th>Smart реклама план накоп.</th>
              <th>Smart реклама факт накоп.</th>
              <th>ДРР без СПП накоп.</th>
              <th>Δ Smart рекламы накоп.</th>
              <th>Реком. Smart реклама / день</th>
              <th>ДРР факт</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>
                  <strong>${escapeHtml(row.period || row.date)}</strong>
                  <div class="muted small">${escapeHtml(row.date)}</div>
                  ${row.source === 'ozon_finance_api' ? `<div class="badge-stack" style="margin-top:4px">${badge(row.isPartial ? 'API частично' : 'API факт', row.isPartial ? 'warn' : 'info')}</div>` : ''}
                </td>
                <td>${fmt.money(row.dailyTargetGmv)}</td>
                <td>${fmt.money(row.factGmv)}</td>
                <td>${fmt.money(row.noSppBuyouts)}</td>
                <td>${numberOrZero(row.noSppBuyoutsFact) ? fmt.money(row.noSppBuyoutsFact) : '—'}</td>
                <td>${fmt.money(row.cumulativeTargetGmv)}</td>
                <td>${fmt.money(row.cumulativeFactGmv)}</td>
                <td>${fmt.money(row.cumulativeNoSppBuyouts)}</td>
                <td>${badge(fmt.money(row.cumulativeGmvDelta), iuDrrToneForRevenueDelta(row.cumulativeGmvDelta))}${progressCell(row.cumulativeGmvCompletion, iuDrrFunnelCompletionTone(row.cumulativeGmvCompletion))}</td>
                <td>${fmt.money(row.dailyTargetAds)}</td>
                <td>${fmt.money(row.adsBoth)}</td>
                <td>${fmt.money(row.cumulativeTargetAds)}</td>
                <td>${fmt.money(row.cumulativeFactAds)}</td>
                <td>${row.cumulativeNoSppDrr != null ? fmt.pct(row.cumulativeNoSppDrr) : '—'}</td>
                <td>${badge(fmt.money(row.cumulativeAdsDelta), iuDrrToneForDelta(row.cumulativeAdsDelta))}${progressCell(row.cumulativeAdsCompletion, iuDrrFunnelAdsCompletionTone(row.cumulativeAdsCompletion))}</td>
                <td>${numberOrZero(row.forecastDailyAds) ? fmt.money(row.forecastDailyAds) : '—'}</td>
                <td>${badge(row.drr != null ? fmt.pct(row.drr) : '—', iuDrrFunnelDrrTone(row.drr, targetDrr))}</td>
              </tr>
            `).join('') || '<tr><td colspan="17">Нет данных Ozon по выбранному месяцу.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderOzonIuPlanFactTableLegacy(model, context = {}) {
  const rows = ozonPlanFactDailyRows(model, context);
  return `
    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Форма ИУ Ozon: план-факт</h3>
          <p class="small muted">План GMV по месяцу, факт и ИУ по двум кабинетам; Smart показываем отдельной нашей долей 40%.</p>
        </div>
        ${badge(rows.length ? `${fmt.int(rows.length)} дней` : 'нет строк', rows.length ? 'ok' : 'warn')}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>План GMV / день</th>
              <th>Факт GMV оба кабинета</th>
              <th>Δ к плану</th>
              <th>Выполнение</th>
              <th>ИУ факт оба кабинета</th>
              <th>ДРР</th>
              <th>Наша доля 40%</th>
              <th>Начислено по отчету Ozon</th>
              <th>Реклама по отчету Ozon</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td><strong>${escapeHtml(row.period || row.date)}</strong><div class="muted small">${escapeHtml(row.date)}</div></td>
                <td>${fmt.money(row.dailyTargetGmv)}</td>
                <td>${fmt.money(row.factGmv)}</td>
                <td>${badge(fmt.money(row.planDeltaGmv), iuDrrToneForRevenueDelta(row.planDeltaGmv))}</td>
                <td>${row.completion != null ? fmt.pct(row.completion) : '—'}</td>
                <td>${fmt.money(row.adsBoth)}</td>
                <td>${row.drr != null ? fmt.pct(row.drr) : '—'}</td>
                <td>${fmt.money(row.smartShareAds)}</td>
                <td>${fmt.money(row.financeAccrued)}</td>
                <td>${fmt.money(row.financeAds)}</td>
              </tr>
            `).join('') || '<tr><td colspan="10">Нет данных Ozon по выбранному месяцу.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderOzonFinanceDailyTable(model, sourceLabel = '') {
  return `
    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div><h3>Сверка начислений Ozon по дням</h3><p class="small muted">${escapeHtml(sourceLabel || 'финансовый отчет Ozon')}</p></div>
        ${badge(model.hasRows ? `${fmt.int(model.dailyRows.length)} дней` : 'нет строк', model.hasRows ? 'ok' : 'warn')}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Начислено</th>
              <th>Продажи</th>
              <th>Возвраты</th>
              <th>Реклама</th>
              <th>ДРР</th>
              <th>Комиссии</th>
              <th>Логистика</th>
              <th>Прочие услуги</th>
            </tr>
          </thead>
          <tbody>
            ${(model.dailyRows || []).map((row) => {
              const rowAds = Math.abs(numberOrZero(row.ads));
              const rowDrr = numberOrZero(row.salesGross) > 0 ? rowAds / numberOrZero(row.salesGross) : null;
              const rowOther = numberOrZero(row.partnerServices) + numberOrZero(row.fboServices) + numberOrZero(row.otherServices) + numberOrZero(row.compensations);
              return `
                <tr>
                  <td><strong>${escapeHtml(row.period || row.date)}</strong><div class="muted small">${escapeHtml(row.date)}</div></td>
                  <td>${fmt.money(row.accruedNet)}</td>
                  <td>${fmt.money(row.salesGross)}</td>
                  <td>${fmt.money(row.returnsGross)}</td>
                  <td>${fmt.money(rowAds)}</td>
                  <td>${rowDrr != null ? fmt.pct(rowDrr) : '—'}</td>
                  <td>${fmt.money(row.ozonReward)}</td>
                  <td>${fmt.money(row.deliveryServices)}</td>
                  <td>${fmt.money(rowOther)}</td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="9">Нет данных финансового отчета Ozon по выбранному месяцу.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderOzonFinanceSkuTable(model) {
  const rows = Array.isArray(model.ozonFinanceSkuRows) ? model.ozonFinanceSkuRows : [];
  return `
    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div><h3>SKU по отчету Ozon</h3><p class="small muted">топ по модулю начисления, остатки и цена из products CSV</p></div>
        ${badge(`${fmt.int(rows.length)} SKU`, 'info')}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>SKU / артикул</th>
              <th>Категория</th>
              <th>Начислено</th>
              <th>Продажи</th>
              <th>Реклама</th>
              <th>Комиссии</th>
              <th>Логистика</th>
              <th>Остаток</th>
              <th>Цена</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>
                  <strong>${escapeHtml(row.article || row.sku || '—')}</strong>
                  <div class="muted small">${escapeHtml(row.productName || row.name || '')}</div>
                  ${row.unmapped ? badge('unmapped', 'warn') : ''}
                </td>
                <td>${escapeHtml(row.category || '—')}<div class="muted small">${escapeHtml(row.productType || '')}</div></td>
                <td>${fmt.money(row.accruedNet)}</td>
                <td>${fmt.money(row.salesGross + row.returnsGross)}</td>
                <td>${fmt.money(Math.abs(numberOrZero(row.ads)))}</td>
                <td>${fmt.money(row.ozonReward)}</td>
                <td>${fmt.money(row.deliveryServices)}</td>
                <td>${fmt.int(row.availableStock)}<div class="muted small">FBO ${fmt.int(row.fboStock)} / FBS ${fmt.int(row.fbsStock)}</div></td>
                <td>${fmt.money(row.price)}</td>
              </tr>
            `).join('') || '<tr><td colspan="9">Нет SKU-детализации.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function wbFeedbacksPayload() {
  const payload = state.wbFeedbacks && typeof state.wbFeedbacks === 'object' ? state.wbFeedbacks : {};
  return {
    generatedAt: payload.generatedAt || '',
    window: payload.window || {},
    currentMonth: payload.currentMonth || {},
    last7Days: payload.last7Days || {},
    summary: payload.summary || {},
    reviewsForPoints: payload.reviewsForPoints || {},
    ratingDynamics: payload.ratingDynamics || {},
    daily: Array.isArray(payload.daily) ? payload.daily : [],
    history: Array.isArray(payload.history) ? payload.history : [],
    cards: Array.isArray(payload.cards) ? payload.cards : [],
    recentFeedbacks: Array.isArray(payload.recentFeedbacks) ? payload.recentFeedbacks : [],
    recentQuestions: Array.isArray(payload.recentQuestions) ? payload.recentQuestions : []
  };
}

function wbFeedbackDeltaTone(value) {
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return 'info';
  return numeric > 0 ? 'ok' : 'danger';
}

function wbFeedbackDeltaLabel(value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
  const numeric = Number(value);
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${fmt.num(numeric, 2)}`;
}

function wbFeedbackRatingTone(value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  if (numeric < 4) return 'danger';
  if (numeric < 4.5) return 'warn';
  return 'ok';
}

function wbFeedbackRatingLabel(value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
  return fmt.num(value, 2);
}

function wbFeedbackHistoryDateLabel(date) {
  const text = String(date || '').trim();
  return text.length >= 10 ? text.slice(5) : (text || '—');
}

function wbFeedbackAddDays(dateKey, delta) {
  const raw = String(dateKey || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const date = new Date(`${raw}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function wbFeedbackRatingCell(point) {
  const value = point?.cumulativeAvgRating;
  const dailyRatings = numberOrZero(point?.ratingFeedbacks);
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '<td><span class="muted">—</span></td>';
  }
  return `
    <td>
      ${badge(fmt.num(value, 2), wbFeedbackRatingTone(value))}
      ${dailyRatings ? `<div class="muted small">+${fmt.int(dailyRatings)}</div>` : ''}
    </td>
  `;
}

function wbFeedbackRatingAggregateSeries(payload) {
  const dynamics = payload.ratingDynamics || {};
  const dates = Array.isArray(dynamics.dates) ? dynamics.dates : [];
  const rows = Array.isArray(dynamics.matrix) ? dynamics.matrix : [];
  return dates.map((date) => {
    let ratingSum = 0;
    let ratingCount = 0;
    let feedbacks = 0;
    let lowRatingCount = 0;
    let reviewPoints = 0;
    rows.forEach((row) => {
      const point = (Array.isArray(row.history) ? row.history : []).find((item) => item.date === date);
      const rating = Number(point?.cumulativeAvgRating);
      if (Number.isFinite(rating)) {
        ratingSum += rating;
        ratingCount += 1;
      }
      feedbacks += numberOrZero(point?.feedbacks);
      lowRatingCount += numberOrZero(point?.lowRatingFeedbacks);
      reviewPoints += numberOrZero(point?.reviewPoints);
    });
    return {
      date,
      avgRating: ratingCount ? ratingSum / ratingCount : null,
      cards: ratingCount,
      feedbacks,
      lowRatingCount,
      reviewPoints
    };
  }).filter((point) => point.avgRating !== null);
}

function wbFeedbackRatingSparkline(series) {
  const points = (Array.isArray(series) ? series : []).filter((point) => point.avgRating !== null);
  if (points.length < 2) return '<div class="empty">Недостаточно точек для графика.</div>';
  const width = 760;
  const height = 190;
  const values = points.map((point) => Number(point.avgRating)).filter(Number.isFinite);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max(0.03, (rawMax - rawMin) * 0.18);
  const min = Math.max(1, rawMin - padding);
  const max = Math.min(5, rawMax + padding);
  const range = Math.max(0.1, max - min);
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : (index / Math.max(1, points.length - 1)) * width;
    const y = height - ((Number(point.avgRating) - min) / range) * (height - 34) - 17;
    return {
      x,
      y,
      point
    };
  });
  const path = coords.map((item) => `${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(' ');
  const first = coords[0];
  const last = coords[coords.length - 1];
  const mid = coords[Math.floor(coords.length / 2)];
  const labels = [first, mid, last].filter(Boolean);
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Динамика среднего рейтинга карточек" style="width:100%;height:190px;display:block">
      <line x1="0" y1="${height - 17}" x2="${width}" y2="${height - 17}" stroke="rgba(255,255,255,.14)" stroke-width="1"></line>
      <line x1="0" y1="17" x2="${width}" y2="17" stroke="rgba(255,255,255,.10)" stroke-width="1"></line>
      <polyline points="${path}" fill="none" stroke="#22c55e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${coords.map((item, index) => index === 0 || index === coords.length - 1 || index % 5 === 0
        ? `<circle cx="${item.x.toFixed(1)}" cy="${item.y.toFixed(1)}" r="${index === coords.length - 1 ? 5 : 3}" fill="${index === coords.length - 1 ? '#fde68a' : '#22c55e'}"></circle>`
        : '').join('')}
      ${labels.map((item, index) => `
        <text x="${Math.min(width - 80, Math.max(8, item.x - 34)).toFixed(1)}" y="${height - 2}" fill="rgba(245,230,199,.72)" font-size="15">${escapeHtml(wbFeedbackHistoryDateLabel(item.point.date))}</text>
        ${index === labels.length - 1 ? `<text x="${Math.min(width - 84, Math.max(8, item.x - 38)).toFixed(1)}" y="${Math.max(26, item.y - 12).toFixed(1)}" fill="#fde68a" font-size="17">${escapeHtml(fmt.num(item.point.avgRating, 2))}</text>` : ''}
      `).join('')}
    </svg>
  `;
}

function renderWbRatingDynamicsChart(payload) {
  const series = wbFeedbackRatingAggregateSeries(payload);
  const latest = series[series.length - 1] || null;
  const prev7 = latest ? series.find((point) => point.date >= wbFeedbackAddDays(latest.date, -7)) : null;
  const delta7 = latest && prev7 ? latest.avgRating - prev7.avgRating : null;
  const latestTone = latest?.avgRating < 4 ? 'danger' : (latest?.avgRating < 4.5 ? 'warn' : 'ok');
  return `
    <div class="card" style="margin-top:12px">
      <div class="section-subhead">
        <div><h3>График среднего рейтинга</h3><p class="small muted">Агрегировано по карточкам из дневной матрицы WB API.</p></div>
        <div class="badge-stack">
          ${badge(latest?.date ? `до ${escapeHtml(latest.date)}` : 'нет даты', latest?.date ? 'ok' : 'warn')}
          ${badge(`${fmt.int(series.length)} точек`, 'info')}
        </div>
      </div>
      <div class="kpi-strip" style="margin-top:12px">
        <div class="mini-kpi ${latestTone}"><span>Средний рейтинг</span><strong>${latest ? fmt.num(latest.avgRating, 2) : '—'}</strong><span>${latest ? `${fmt.int(latest.cards)} карточек` : 'нет точки'}</span></div>
        <div class="mini-kpi ${wbFeedbackDeltaTone(delta7)}"><span>За 7 дней</span><strong>${wbFeedbackDeltaLabel(delta7)}</strong><span>${prev7?.date || 'нет базы'}</span></div>
        <div class="mini-kpi warn"><span>Оценки 1–3 в последний день</span><strong>${fmt.int(latest?.lowRatingCount)}</strong><span>${fmt.int(latest?.feedbacks)} отзывов</span></div>
        <div class="mini-kpi"><span>Отзывы за баллы</span><strong>${fmt.money(latest?.reviewPoints)}</strong><span>последний день</span></div>
      </div>
      ${wbFeedbackRatingSparkline(series)}
    </div>
  `;
}

function renderWbRatingDynamicsMatrix(payload) {
  const dynamics = payload.ratingDynamics || {};
  const dates = Array.isArray(dynamics.dates) ? dynamics.dates : [];
  const rows = Array.isArray(dynamics.matrix) ? dynamics.matrix : [];
  if (!rows.length || !dates.length) {
    return `
      <div class="section-subhead" style="margin-top:14px">
        <div><h3>Динамика рейтинга карточек</h3><p class="small muted">История появится после обновления WB API.</p></div>
        ${badge('нет матрицы', 'warn')}
      </div>
    `;
  }
  const sortedRows = rows.slice().sort((left, right) => {
    const leftDelta = numberOrZero(left.ratingDelta);
    const rightDelta = numberOrZero(right.ratingDelta);
    const leftBucket = leftDelta < 0 ? 0 : (leftDelta > 0 ? 1 : 2);
    const rightBucket = rightDelta < 0 ? 0 : (rightDelta > 0 ? 1 : 2);
    if (leftBucket !== rightBucket) return leftBucket - rightBucket;
    if (leftBucket === 0) return leftDelta - rightDelta;
    if (leftBucket === 1) return rightDelta - leftDelta;
    return numberOrZero(right.feedbackCount) - numberOrZero(left.feedbackCount);
  }).slice(0, 30);
  const topDrop = Array.isArray(dynamics.topDrops) && dynamics.topDrops.length ? dynamics.topDrops[0] : null;
  const topGrowth = Array.isArray(dynamics.topGrowth) && dynamics.topGrowth.length ? dynamics.topGrowth[0] : null;
  return `
    <div class="section-subhead" style="margin-top:14px">
      <div><h3>Динамика рейтинга карточек</h3><p class="small muted">Дневная матрица WB API по карточкам: рост и падение считаются по накопленной средней оценке новых отзывов.</p></div>
      <div class="badge-stack">
        ${badge(`${fmt.int(dynamics.historyDays || dates.length)} дней`, 'info')}
        ${badge(`${fmt.int(dynamics.cardsObserved || rows.length)} карточек`, 'info')}
      </div>
    </div>
    <div class="kpi-strip" style="margin-top:12px">
      <div class="mini-kpi danger"><span>Падают</span><strong>${fmt.int(dynamics.cardsWithDrop)}</strong><span>${topDrop ? `${escapeHtml(topDrop.articleKey || topDrop.supplierArticle || topDrop.nmId || '')} ${wbFeedbackDeltaLabel(topDrop.ratingDelta)}` : 'нет падения'}</span></div>
      <div class="mini-kpi ok"><span>Растут</span><strong>${fmt.int(dynamics.cardsWithGrowth)}</strong><span>${topGrowth ? `${escapeHtml(topGrowth.articleKey || topGrowth.supplierArticle || topGrowth.nmId || '')} ${wbFeedbackDeltaLabel(topGrowth.ratingDelta)}` : 'нет роста'}</span></div>
      <div class="mini-kpi"><span>Без изменения</span><strong>${fmt.int(dynamics.cardsFlat)}</strong><span>дельта около нуля</span></div>
      <div class="mini-kpi warn"><span>Оценки 1-3</span><strong>${fmt.int(rows.reduce((sum, row) => sum + numberOrZero(row.lowRatingCount), 0))}</strong><span>по карточкам в матрице</span></div>
    </div>
    ${renderWbRatingDynamicsChart(payload)}
    <div class="table-wrap" style="margin-top:12px">
      <table>
        <thead>
          <tr>
            <th>Карточка</th>
            <th>Старт</th>
            <th>Сейчас</th>
            <th>Динамика</th>
            <th>За 7 дней</th>
            <th>Отзывы</th>
            <th>1-3</th>
            <th>Отзывы за баллы</th>
            ${dates.map((date) => `<th>${escapeHtml(wbFeedbackHistoryDateLabel(date))}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${sortedRows.map((row) => {
            const historyByDate = new Map((Array.isArray(row.history) ? row.history : []).map((point) => [point.date, point]));
            return `
              <tr>
                <td>
                  <strong>${row.articleKey ? linkToSku(row.articleKey, row.articleKey) : escapeHtml(row.supplierArticle || row.nmId || '—')}</strong>
                  <div class="muted small">${escapeHtml(row.productName || '')}</div>
                </td>
                <td>${badge(wbFeedbackRatingLabel(row.firstRating), wbFeedbackRatingTone(row.firstRating))}<div class="muted small">${escapeHtml(row.firstDate || '')}</div></td>
                <td>${badge(wbFeedbackRatingLabel(row.latestRating), wbFeedbackRatingTone(row.latestRating))}<div class="muted small">${escapeHtml(row.latestDate || '')}</div></td>
                <td>${badge(wbFeedbackDeltaLabel(row.ratingDelta), wbFeedbackDeltaTone(row.ratingDelta))}</td>
                <td>${badge(wbFeedbackDeltaLabel(row.last7RatingDelta), wbFeedbackDeltaTone(row.last7RatingDelta))}</td>
                <td>${fmt.int(row.feedbackCount)}<div class="muted small">${fmt.int(row.ratingCount)} оценок</div></td>
                <td>${badge(fmt.int(row.lowRatingCount), numberOrZero(row.lowRatingCount) ? 'danger' : 'ok')}</td>
                <td>${fmt.money(row.reviewPoints)}<div class="muted small">${fmt.int(row.reviewPointsFeedbackCount)} отзывов</div></td>
                ${dates.map((date) => wbFeedbackRatingCell(historyByDate.get(date))).join('')}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderWbFeedbacksIuDrrPanel() {
  const payload = wbFeedbacksPayload();
  if (!payload.cards.length) {
    return `
      <div class="card" style="margin-top:14px">
        <div class="section-subhead">
          <div><h3>WB отзывы и рейтинг карточек</h3><p class="small muted">Срез WB API пока не загружен.</p></div>
          ${badge('нет данных', 'warn')}
        </div>
      </div>
    `;
  }
  const monthFeedbacks = payload.currentMonth?.feedbacks || payload.summary?.feedbacks || {};
  const monthQuestions = payload.currentMonth?.questions || payload.summary?.questions || {};
  const counters = payload.summary?.counters || {};
  const reviewsForPoints = payload.reviewsForPoints || {};
  const reviewPointsMonth = numberOrZero(monthFeedbacks.reviewPoints) || numberOrZero(reviewsForPoints.spend);
  const reviewPointsFeedbacks = numberOrZero(monthFeedbacks.reviewPointsFeedbacks) || numberOrZero(reviewsForPoints.feedbacks);
  const cards = payload.cards.slice(0, 12);
  const historyRows = (payload.history.length ? payload.history : payload.daily.map((row) => ({
    date: row.date,
    avgRating: row.avgRating,
    feedbacks: row.feedbacks,
    lowRatingFeedbacks: row.lowRatingFeedbacks,
    unansweredFeedbacks: row.unansweredFeedbacks,
    reviewPoints: row.reviewPoints,
    reviewPointsFeedbacks: row.reviewPointsFeedbacks
  }))).slice(-14);
  const recentOpenFeedbacks = payload.recentFeedbacks.filter((item) => !item.answered).slice(0, 5);
  const recentOpenQuestions = payload.recentQuestions.filter((item) => !item.answered).slice(0, 5);
  const openSignals = [...recentOpenFeedbacks, ...recentOpenQuestions].slice(0, 6);
  const windowLabel = payload.window?.from && payload.window?.to ? `${payload.window.from} — ${payload.window.to}` : 'последний срез';
  const reviewPointsStatus = reviewsForPoints.apiAvailable
    ? fmt.money(reviewPointsMonth)
    : 'нет API';
  const reviewPointsNote = reviewsForPoints.apiAvailable
    ? `${fmt.int(reviewPointsFeedbacks)} отзывов`
    : 'WB не отдает бюджет';
  const ratingDynamicsHtml = renderWbRatingDynamicsMatrix(payload);
  return `
    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div><h3>Рейтинг WB карточек, отзывы и вопросы</h3><p class="small muted">Срез ${escapeHtml(windowLabel)} · история хранится по ежедневным срезам.</p></div>
        <div class="badge-stack">
          ${badge(payload.generatedAt ? `API ${fmt.date(payload.generatedAt)}` : 'API', payload.generatedAt ? 'ok' : 'warn')}
          ${badge(`${fmt.int(payload.cards.length)} карточек`, 'info')}
        </div>
      </div>

      <div class="kpi-strip" style="margin-top:12px">
        <div class="mini-kpi"><span>Отзывы WB за месяц</span><strong>${fmt.int(monthFeedbacks.count)}</strong><span>средняя ${fmt.num(monthFeedbacks.avgRating, 2)}</span></div>
        <div class="mini-kpi ${numberOrZero(counters.feedbacksUnansweredNow) ? 'warn' : 'ok'}"><span>Не отвечено</span><strong>${fmt.int(counters.feedbacksUnansweredNow ?? monthFeedbacks.unanswered)}</strong><span>сегодня ${fmt.int(counters.feedbacksUnansweredToday)}</span></div>
        <div class="mini-kpi ${numberOrZero(monthFeedbacks.lowRating) ? 'danger' : 'ok'}"><span>Оценки 1–3</span><strong>${fmt.int(monthFeedbacks.lowRating)}</strong><span>за текущий месяц</span></div>
        <div class="mini-kpi ${numberOrZero(monthQuestions.unanswered) ? 'warn' : 'ok'}"><span>Вопросы WB</span><strong>${fmt.int(monthQuestions.count)}</strong><span>открыто ${fmt.int(monthQuestions.unanswered)}</span></div>
        <div class="mini-kpi"><span>Рейтинг новых отзывов</span><strong>${fmt.num(monthFeedbacks.avgRating, 2)}</strong><span>по оценкам API</span></div>
        <div class="mini-kpi warn"><span>Отзывы за баллы</span><strong>${reviewPointsStatus}</strong><span>${escapeHtml(reviewPointsNote)}</span></div>
      </div>

      ${ratingDynamicsHtml}

      <div class="table-wrap" style="margin-top:12px">
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Рейтинг новых отзывов</th>
              <th>Отзывы</th>
              <th>Оценки 1–3</th>
              <th>Не отвечено</th>
              <th>Отзывы за баллы</th>
            </tr>
          </thead>
          <tbody>
            ${historyRows.slice().reverse().map((row) => `
              <tr>
                <td><strong>${escapeHtml(row.date || '—')}</strong></td>
                <td>${row.avgRating != null ? fmt.num(row.avgRating, 2) : '—'}</td>
                <td>${fmt.int(row.feedbacks)}</td>
                <td>${badge(fmt.int(row.lowRatingFeedbacks), numberOrZero(row.lowRatingFeedbacks) ? 'danger' : 'ok')}</td>
                <td>${badge(fmt.int(row.unansweredFeedbacks), numberOrZero(row.unansweredFeedbacks) ? 'warn' : 'ok')}</td>
                <td>${fmt.money(row.reviewPoints)}<div class="muted small">${fmt.int(row.reviewPointsFeedbacks)} отзывов</div></td>
              </tr>
            `).join('') || '<tr><td colspan="6">История появится после ежедневных срезов.</td></tr>'}
          </tbody>
        </table>
      </div>

      <div class="table-wrap" style="margin-top:12px">
        <table>
          <thead>
            <tr>
              <th>Карточка</th>
              <th>Рейтинг новых</th>
              <th>Рейтинг в портале</th>
              <th>Динамика</th>
              <th>Отзывы</th>
              <th>1–3</th>
              <th>Не отвечено</th>
              <th>Вопросы</th>
            </tr>
          </thead>
          <tbody>
            ${cards.map((card) => `
              <tr>
                <td>
                  <strong>${card.articleKey ? linkToSku(card.articleKey, card.articleKey) : escapeHtml(card.supplierArticle || card.nmId || '—')}</strong>
                  <div class="muted small">${escapeHtml(card.productName || '')}</div>
                </td>
                <td>${card.avgRating != null ? fmt.num(card.avgRating, 2) : '—'}</td>
                <td>${card.portalRating != null ? fmt.num(card.portalRating, 2) : '—'}</td>
                <td>${badge(wbFeedbackDeltaLabel(card.ratingDeltaVsPrevious), wbFeedbackDeltaTone(card.ratingDeltaVsPrevious))}</td>
                <td>${fmt.int(card.feedbackCount)}</td>
                <td>${badge(fmt.int(card.lowRatingCount), numberOrZero(card.lowRatingCount) ? 'danger' : 'ok')}</td>
                <td>${badge(fmt.int(card.unansweredFeedbackCount), numberOrZero(card.unansweredFeedbackCount) ? 'warn' : 'ok')}</td>
                <td>${fmt.int(card.questionCount)}</td>
              </tr>
            `).join('') || '<tr><td colspan="8">Нет карточек в срезе WB.</td></tr>'}
          </tbody>
        </table>
      </div>

      ${openSignals.length ? `
        <div class="alert-stack" style="margin-top:12px">
          ${openSignals.map((item) => `
            <div class="alert-row">
              <div>
                <strong>${escapeHtml(item.articleKey || item.supplierArticle || item.nmId || 'WB')}</strong>
                <div class="muted small">${escapeHtml(item.textSnippet || item.productName || '')}</div>
              </div>
              <div class="badge-stack">
                ${item.valuation != null ? badge(`${fmt.num(item.valuation, 0)}★`, item.valuation <= 3 ? 'danger' : 'info') : badge('вопрос', 'warn')}
                ${badge(item.date || '—')}
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function wbSubstitutionTrafficPayload() {
  const payload = state.wbSubstitutionTraffic && typeof state.wbSubstitutionTraffic === 'object' ? state.wbSubstitutionTraffic : {};
  return normalizeWbSubstitutionTrafficPayload(payload);
}

function wbSubstitutionTrafficTone(rate) {
  if (rate === null || rate === undefined || Number.isNaN(Number(rate))) return '';
  const numeric = Number(rate);
  if (numeric >= 0.06) return 'ok';
  if (numeric >= 0.03) return 'warn';
  return 'danger';
}

function renderWbSubstitutionTrafficPanel() {
  const payload = wbSubstitutionTrafficPayload();
  const summary = payload.summary || {};
  const articles = payload.articles || [];
  if (!articles.length) {
    return `
      <div class="card" style="margin-top:14px">
        <div class="section-subhead">
          <div><h3>WB подменные артикулы</h3><p class="small muted">Срез трафика и заказов по подменам пока не загружен.</p></div>
          ${badge('нет данных', 'warn')}
        </div>
      </div>
    `;
  }
  const topRows = articles
    .slice()
    .sort((left, right) => (
      numberOrZero(right.orders) - numberOrZero(left.orders)
      || numberOrZero(right.views) - numberOrZero(left.views)
      || String(left.articleKey || '').localeCompare(String(right.articleKey || ''), 'ru')
    ))
    .slice(0, 24);
  const sourceLabel = payload.asOfDate || payload.source?.sourceGeneratedAt || payload.generatedAt || '';
  return `
    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div><h3>WB подменные артикулы: трафик и заказы</h3><p class="small muted">Orders из файла WB считаются как продажи в штуках; рублевую выручку здесь не подставляем.</p></div>
        <div class="badge-stack">
          ${badge(sourceLabel ? `срез ${escapeHtml(sourceLabel)}` : 'срез WB', sourceLabel ? 'ok' : 'warn')}
          ${badge(`${fmt.int(summary.rowCount)} строк`, 'info')}
          ${badge(`${fmt.int(summary.matchedArticleCount)} SKU`, 'info')}
        </div>
      </div>
      <div class="kpi-strip" style="margin-top:12px">
        <div class="mini-kpi"><span>Просмотры подмен</span><strong>${fmt.int(summary.views)}</strong><span>${fmt.int(summary.substitutionArticleCount)} подменных артикулов</span></div>
        <div class="mini-kpi ${wbSubstitutionTrafficTone(summary.orderRate)}"><span>Заказы</span><strong>${fmt.int(summary.orders)}</strong><span>конверсия ${fmt.pct(summary.orderRate)}</span></div>
        <div class="mini-kpi"><span>Корзины</span><strong>${fmt.int(summary.carts)}</strong><span>конверсия ${fmt.pct(summary.cartRate)}</span></div>
        <div class="mini-kpi"><span>Избранное</span><strong>${fmt.int(summary.favorites)}</strong><span>${fmt.int(summary.campaignCount)} кампаний</span></div>
        <div class="mini-kpi ${numberOrZero(summary.unmatchedRowCount) ? 'warn' : 'ok'}"><span>Матчинг SKU</span><strong>${fmt.int(summary.mappedRowCount)}</strong><span>не сматчено ${fmt.int(summary.unmatchedRowCount)}</span></div>
      </div>
      <div class="table-wrap" style="margin-top:12px">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Трафик</th>
              <th>Заказы</th>
              <th>Корзины</th>
              <th>Избранное</th>
              <th>Подмены</th>
              <th>Топ подмена</th>
            </tr>
          </thead>
          <tbody>
            ${topRows.map((row) => {
              const top = Array.isArray(row.topSubstitutions) ? row.topSubstitutions[0] : null;
              const articleTitle = row.article || row.sellerArticle || row.articleKey || 'WB';
              const articleHtml = row.matched && row.articleKey ? linkToSku(row.articleKey, articleTitle) : `<strong>${escapeHtml(articleTitle)}</strong>`;
              return `
                <tr>
                  <td>${articleHtml}<div class="muted small">${escapeHtml(row.name || row.title || '')}</div></td>
                  <td><strong>${fmt.int(row.views)}</strong><div class="muted small">строк ${fmt.int(row.rowCount)}</div></td>
                  <td>${badge(fmt.int(row.orders), wbSubstitutionTrafficTone(row.orderRate))}<div class="muted small">${fmt.pct(row.orderRate)}</div></td>
                  <td>${fmt.int(row.carts)}<div class="muted small">${fmt.pct(row.cartRate)}</div></td>
                  <td>${fmt.int(row.favorites)}</td>
                  <td>${fmt.int(row.substitutionCount)}<div class="muted small">${fmt.int(row.campaignCount)} кампаний</div></td>
                  <td>${top ? `<strong>${escapeHtml(top.label || top.key || '')}</strong><div class="muted small">${fmt.int(top.orders)} заказов · ${fmt.int(top.views)} просмотров</div>` : '<span class="muted">—</span>'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderWbCardRating(rootId = 'view-wb-rating') {
  const root = document.getElementById(rootId);
  if (!root) return;
  const payload = wbFeedbacksPayload();
  const dynamics = payload.ratingDynamics || {};
  const windowLabel = payload.window?.from && payload.window?.to ? `${payload.window.from} — ${payload.window.to}` : 'последний срез';
  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Рейтинг карточек WB</h2>
        <p>Отзывы, вопросы, отзывы за баллы и динамика рейтинга карточек по WB API.</p>
      </div>
      <div class="badge-stack">
        ${badge(payload.generatedAt ? `API ${fmt.date(payload.generatedAt)}` : 'API', payload.generatedAt ? 'ok' : 'warn')}
        ${badge(`${fmt.int(payload.cards.length)} карточек`, 'info')}
        ${badge(`${fmt.int(dynamics.cardsWithDrop)} падают`, numberOrZero(dynamics.cardsWithDrop) ? 'danger' : 'ok')}
        ${badge(`${fmt.int(dynamics.cardsWithGrowth)} растут`, numberOrZero(dynamics.cardsWithGrowth) ? 'ok' : 'info')}
        ${badge(windowLabel, 'info')}
      </div>
    </div>
    ${renderWbSubstitutionTrafficPanel()}
    ${renderWbFeedbacksIuDrrPanel()}
  `;
}

function iuDrrExportRows(rows, model) {
  if (model.selectedPlatform === 'ozon') {
    const planMonth = model.ozonPlanMonth || ozonPlanMonthSummary(model.payload.ozonPlan || {}, model.selectedMonth);
    const targetDrr = numberOrZero(model.monthSummary?.planPctOzon || planMonth.totals?.targetDrr) || 0.25;
    const smartShare = numberOrZero(planMonth.allocation?.smartShare || 0.4);
    const monthTargetGmv = ozonPlanFactMonthTargetGmv(model, planMonth);
    const monthTargetAds = monthTargetGmv * targetDrr;
    const contractKpis = model.payload.ozonPlan?.contractKpis || {};
    const adRevKpiRate = numberOrZero(contractKpis.adRevKpiRate) || targetDrr;
    const sppRate = numberOrZero(contractKpis.sppRate);
    return ozonPlanFactDailyRows(model, { monthTargetGmv, smartShare, targetDrr }).map((row) => ({
      month: model.selectedMonth,
      platform: 'Ozon',
      date: row.date,
      period: row.period || row.date,
      month_target_gmv: monthTargetGmv,
      month_target_ads: monthTargetAds,
      adrev_kpi_pct: Math.round(adRevKpiRate * 10000) / 100,
      spp_pct: sppRate ? Math.round(sppRate * 10000) / 100 : '',
      daily_target_gmv: row.dailyTargetGmv,
      smart_revenue: row.factGmv,
      smart_gmv: row.smartGmv,
      smart_ads: row.adsBoth,
      smart_drr_revenue_pct: row.smartDrrRevenue != null ? Math.round(Number(row.smartDrrRevenue) * 10000) / 100 : '',
      smart_drr_gmv_pct: row.smartDrrGmv != null ? Math.round(Number(row.smartDrrGmv) * 10000) / 100 : '',
      gmv_delta: row.planDeltaGmv,
      cumulative_target_gmv: row.cumulativeTargetGmv,
      cumulative_fact_gmv: row.cumulativeFactGmv,
      cumulative_gmv_delta: row.cumulativeGmvDelta,
      cumulative_gmv_completion_pct: row.cumulativeGmvCompletion != null ? Math.round(Number(row.cumulativeGmvCompletion) * 10000) / 100 : '',
      completion_pct: row.completion != null ? Math.round(Number(row.completion) * 10000) / 100 : '',
      target_drr_pct: Math.round(targetDrr * 10000) / 100,
      daily_target_ads: row.dailyTargetAds,
      smart_ads_fact: row.adsBoth,
      ads_delta_daily: row.adsDeltaDaily,
      cumulative_target_ads: row.cumulativeTargetAds,
      cumulative_fact_ads: row.cumulativeFactAds,
      cumulative_ads_delta: row.cumulativeAdsDelta,
      cumulative_ads_completion_pct: row.cumulativeAdsCompletion != null ? Math.round(Number(row.cumulativeAdsCompletion) * 10000) / 100 : '',
      dashboard_ads_delta: row.dashboardAdsDelta,
      dashboard_cumulative_ads: row.dashboardCumulativeAds,
      forecast_daily_ads: row.forecastDailyAds,
      fact_drr_pct: row.drr != null ? Math.round(Number(row.drr) * 10000) / 100 : '',
      target_ads_by_fact: row.targetAdsByFact,
      ads_reserve: row.adsReserve
    }));
  }
  return rows.map((row) => ({
    month: model.selectedMonth,
    platform: 'WB',
    date: row.date,
    period: row.period || row.date,
    target_revenue_wb: row.iuTargetRevenueWb || row.targetRevenueWb,
    revenue_wb: row.wbApiRevenue || row.iuRevenueWb || row.revenueWb || row.iuOrdersRevenueWb || row.ordersRevenueWb,
    orders_revenue_wb: row.ordersRevenueWb,
    ads_pct_base_wb: row.wbApiRevenue || row.adsPctBaseWb || row.iuRevenueWb || row.revenueWb || row.iuOrdersRevenueWb,
    revenue_wb_delta: row.iuRevenueWbDelta,
    revenue_wb_delta_pct: row.iuRevenueWbDeltaPct != null ? Math.round(Number(row.iuRevenueWbDeltaPct) * 10000) / 100 : '',
    revenue_ozon: row.revenueOzon,
    revenue_iu_total: row.revenueTotalIu,
    plan_pct: row.planPct != null ? Math.round(Number(row.planPct) * 10000) / 100 : '',
    plan_spend_wb: row.iuPlanSpendWb || row.planSpendWb,
    spend_fact: row.spendFact,
    spend_fact_total: row.spendFactTotal,
    fact_drr_pct: row.iuFactPct != null ? Math.round(Number(row.iuFactPct) * 10000) / 100 : '',
    orders_ad_pct: row.ordersAdPct != null ? Math.round(Number(row.ordersAdPct) * 10000) / 100 : '',
    wb_promotion: row.wbPromotion,
    wb_media: row.wbMedia,
    wb_influencer: row.wbInfluencer,
    pvz_ads: row.pvzAds,
    brand_zone: row.brandZone,
    overviews: row.overviews,
    review_points: row.reviewPoints,
    external_ads: row.externalAds,
    spend_delta: row.iuSpendDelta,
    spend_delta_pct: row.iuSpendDeltaPct != null ? Math.round(Number(row.iuSpendDeltaPct) * 10000) / 100 : '',
    views: row.adsViews,
    clicks: row.adsClicks,
    orders: row.adsOrders
  }));
}

function downloadIuDrrExcel(model) {
  const rows = iuDrrExportRows(model.dailyRows, model);
  if (!rows.length) {
    window.alert('По выбранному месяцу нет строк для выгрузки.');
    return;
  }
  if (model.selectedPlatform === 'ozon') {
    downloadLaunchesHtmlTable([
      ['month', 'Месяц'],
      ['platform', 'Площадка'],
      ['date', 'Дата'],
      ['period', 'Период'],
      ['month_target_gmv', 'Smart план / месяц'],
      ['month_target_ads', 'Smart реклама план / месяц'],
      ['adrev_kpi_pct', 'AdRev KPI / цель ДРР, %'],
      ['spp_pct', 'СПП по договору, %'],
      ['daily_target_gmv', 'Smart план / день'],
      ['smart_revenue', 'Smart факт / день'],
      ['smart_gmv', 'Smart GMV / день'],
      ['cumulative_target_gmv', 'Smart план накопительно'],
      ['cumulative_fact_gmv', 'Smart факт накопительно'],
      ['cumulative_gmv_delta', 'Отклонение Smart накопительно'],
      ['cumulative_gmv_completion_pct', 'Smart выполнение накопительно, %'],
      ['daily_target_ads', 'Реклама план / день'],
      ['smart_ads_fact', 'Smart реклама факт / день'],
      ['cumulative_target_ads', 'Реклама план накопительно'],
      ['cumulative_fact_ads', 'Реклама факт накопительно'],
      ['cumulative_ads_delta', 'Отклонение рекламы накопительно'],
      ['cumulative_ads_completion_pct', 'Реклама выполнение накопительно, %'],
      ['dashboard_ads_delta', 'Дельта Smart-рекламы из дашборда Ozon'],
      ['dashboard_cumulative_ads', 'Smart-реклама накопительно из дашборда Ozon'],
      ['forecast_daily_ads', 'Реком. Smart-реклама / день из дашборда Ozon'],
      ['fact_drr_pct', 'ДРР факт, %']
    ], rows, `iu-drr-ozon-${model.selectedMonth || todayIso()}.xls`);
    return;
    downloadLaunchesHtmlTable([
      ['month', 'Месяц'],
      ['platform', 'Площадка'],
      ['date', 'Дата'],
      ['period', 'Период'],
      ['daily_target_gmv', 'План GMV / день'],
      ['fact_gmv_both_accounts', 'Факт GMV оба кабинета'],
      ['gmv_delta', 'Дельта GMV к плану'],
      ['completion_pct', 'Выполнение, %'],
      ['target_drr_pct', 'Целевой ДРР, %'],
      ['ads_fact_both_accounts', 'ИУ факт оба кабинета'],
      ['fact_drr_pct', 'Факт ДРР, %'],
      ['target_ads_by_fact', 'Бюджет ИУ от факта'],
      ['ads_reserve', 'Резерв / перерасход ИУ'],
      ['smart_share_pct', 'Наша доля Smart, %'],
      ['smart_share_ads', 'Наша доля 40% ИУ'],
      ['smart_share_gmv', 'Наша доля 40% GMV'],
      ['finance_accrued', 'Начислено по отчету Ozon'],
      ['finance_sales', 'Продажи по отчету Ozon'],
      ['finance_ads', 'Реклама по отчету Ozon']
    ], rows, `iu-drr-ozon-${model.selectedMonth || todayIso()}.xls`);
    return;
  }
  downloadLaunchesHtmlTable([
    ['month', 'Месяц'],
    ['platform', 'Площадка'],
    ['date', 'Дата'],
    ['period', 'Период'],
    ['target_revenue_wb', 'Целевой оборот WB'],
    ['revenue_wb', 'Продажи WB. Фактический оборот по розничным ценам'],
    ['orders_revenue_wb', 'Заказы WB. Сверка с отчетом WB'],
    ['ads_pct_base_wb', 'База расчета рекламы WB по договору'],
    ['revenue_wb_delta', 'Разница оборота WB'],
    ['revenue_wb_delta_pct', 'Разница оборота WB, %'],
    ['revenue_ozon', 'Оборот Ozon'],
    ['revenue_iu_total', 'Оборот ИУ WB+Ozon'],
    ['plan_pct', 'Реклама. План в %'],
    ['plan_spend_wb', 'План расхода WB'],
    ['spend_fact', 'Реклама. Фактические затраты без Внешки'],
    ['spend_fact_total', 'Расход всего с Внешкой'],
    ['fact_drr_pct', 'Реклама. Факт в % по договору'],
    ['orders_ad_pct', 'Реклама. Факт в % от заказов'],
    ['wb_promotion', 'ВБ Продвижение'],
    ['wb_media', 'ВБ Медиа'],
    ['wb_influencer', 'ВБ Инфлюенс'],
    ['pvz_ads', 'Реклама в ПВЗ'],
    ['brand_zone', 'Брендзона'],
    ['overviews', 'Обзоры'],
    ['review_points', 'Отзывы за баллы'],
    ['external_ads', 'Внешка'],
    ['spend_delta', 'Дельта расхода по ИУ'],
    ['spend_delta_pct', 'Дельта расхода по ИУ, %'],
    ['views', 'Показы'],
    ['clicks', 'Клики'],
    ['orders', 'Заказы']
  ], rows, `iu-drr-wb-${model.selectedMonth || todayIso()}.xls`);
}

function iuDrrSummaryHasPayload(payload = {}) {
  return Boolean(
    Array.isArray(payload.daily) && payload.daily.length
    || Array.isArray(payload.months) && payload.months.length
    || payload.kpis?.monthKey
  );
}

function reloadIuDrrSummaryFromFile(rootId = 'view-iu-drr') {
  if (state.__iuDrrSummaryReloading) return true;
  const lastEmptyReload = numberOrZero(state.__iuDrrSummaryEmptyReloadAt);
  if (lastEmptyReload && Date.now() - lastEmptyReload < 10000) return false;
  state.__iuDrrSummaryReloading = true;
  if (typeof renderViewLoading === 'function') renderViewLoading(rootId, 'IU / DRR');
  loadJsonOrFallback('data/iu_drr_summary.json', { generatedAt: '', asOfDate: '', months: [], daily: [], channels: [], diagnostics: {} }, 'IU / DRR')
    .then((summary) => {
      const normalized = normalizeIuDrrSummaryPayload(summary && typeof summary === 'object' ? summary : {});
      state.iuDrrSummary = normalized;
      if (state.boot?.lazyReady) state.boot.lazyReady.iuDrr = true;
      if (!iuDrrSummaryHasPayload(normalized)) state.__iuDrrSummaryEmptyReloadAt = Date.now();
    })
    .catch((error) => {
      state.__iuDrrSummaryEmptyReloadAt = Date.now();
      console.warn('[iu-drr] local summary reload', error);
    })
    .finally(() => {
      state.__iuDrrSummaryReloading = false;
      renderIuDrr(rootId);
    });
  return true;
}

function renderIuDrr(rootId = 'view-iu-drr') {
  const root = document.getElementById(rootId);
  if (!root) return;
  if (!iuDrrSummaryHasPayload(state.iuDrrSummary || {}) && reloadIuDrrSummaryFromFile(rootId)) return;
  const model = iuDrrBuildModel(state.iuDrrSummary || {});
  const month = model.monthSummary || {};
  const platformMeta = iuDrrPlatformMeta(model);
  const isOzonView = model.selectedPlatform === 'ozon';
  const isYandexView = model.selectedPlatform === 'ya';
  const factDrr = month.drrWb != null ? month.drrWb : null;
  const deltaTone = iuDrrToneForDelta(month.spendDelta);
  const ozonAdsDeltaTone = iuDrrToneForDelta(platformMeta.adsDelta);
  const revenueDeltaTone = iuDrrToneForRevenueDelta(platformMeta.revenueDelta);
  const totalIuTone = numberOrZero(month.iuRevenueCompletionToDate) >= 1 ? 'ok' : 'warn';
  const platformIuTone = numberOrZero(platformMeta.completion) >= 1 ? 'ok' : 'warn';
  const externalSpend = numberOrZero(month.externalAds || month.channels?.externalAds?.spend);
  const sourceWarnings = [
    ...(model.payload.diagnostics?.noSourceChannels || []).map((item) => `${item}: нет источника`),
    ...(model.payload.diagnostics?.unmatchedNmIds || []).slice(0, 5).map((item) => `nmId ${item.nmId}: не сопоставлен`)
  ];
  const ozonFinance = model.ozonFinance || {};
  const ozonFinanceMonth = model.ozonFinanceMonth || {};
  const ozonPlan = model.payload.ozonPlan || {};
  const ozonContractKpis = ozonPlan.contractKpis || {};
  const ozonPlanMonth = model.ozonPlanMonth || ozonPlanMonthSummary(ozonPlan, model.selectedMonth);
  const ozonPlanTotals = ozonPlanMonth.totals || ozonPlan.totals || {};
  const ozonAllocation = ozonPlanMonth.allocation || ozonPlan.allocation || {};
  const ozonControl = ozonFinance.control || {};
  const ozonSalesNet = numberOrZero(ozonFinanceMonth.salesGross) + numberOrZero(ozonFinanceMonth.returnsGross);
  const ozonAdsAbs = Math.abs(numberOrZero(ozonFinanceMonth.ads));
  const ozonDrr = numberOrZero(ozonFinanceMonth.salesGross) > 0 ? ozonAdsAbs / numberOrZero(ozonFinanceMonth.salesGross) : null;
  const ozonControlDelta = ozonControl.deltaToSellerUi;
  const ozonControlTone = ozonControlDelta === null || ozonControlDelta === undefined
    ? 'info'
    : Math.abs(numberOrZero(ozonControlDelta)) <= 1000 ? 'ok' : 'warn';
  const ozonTargetDrr = numberOrZero(month.planPctOzon)
    || numberOrZero(ozonPlanTotals.targetDrr)
    || numberOrZero((ozonPlan.accounts || []).find((account) => account.key === 'smart')?.targetDrr)
    || 0.25;
  const ozonAdRevKpiRate = numberOrZero(ozonContractKpis.adRevKpiRate) || ozonTargetDrr;
  const ozonSppRate = numberOrZero(ozonContractKpis.sppRate);
  const ozonTargetSpendByFact = numberOrZero(ozonFinanceMonth.salesGross) * ozonTargetDrr;
  const ozonSpendReserve = ozonTargetSpendByFact - ozonAdsAbs;
  const ozonSmartShare = numberOrZero(ozonAllocation.smartShare || 0.4);
  const ozonMonthTargetGmv = ozonPlanFactMonthTargetGmv(model, ozonPlanMonth);
  const ozonPlanFactContext = iuDrrOzonPlanFactContext(model, {
    monthTargetGmv: ozonMonthTargetGmv,
    smartShare: ozonSmartShare,
    targetDrr: ozonTargetDrr
  });
  const ozonPlanFactRows = ozonPlanFactContext.ozonPlanFactRows;
  const ozonPlanFactLastRow = ozonPlanFactRows[ozonPlanFactRows.length - 1] || {};
  const ozonSmartDailyRows = (ozonPlan.daily || [])
    .filter((row) => row.monthKey === model.selectedMonth)
    .map((row) => ({ date: row.date, ...(row.accountBreakdown?.smart || {}) }))
    .filter((row) => numberOrZero(row.revenue) || numberOrZero(row.gmv) || numberOrZero(row.ads));
  const ozonSmartRevenue = ozonSmartDailyRows.reduce((sum, row) => sum + numberOrZero(row.revenue), 0);
  const ozonSmartGmv = ozonSmartDailyRows.reduce((sum, row) => sum + numberOrZero(row.gmv), 0);
  const ozonSmartAds = ozonSmartDailyRows.reduce((sum, row) => sum + numberOrZero(row.ads), 0);
  const ozonDaysInMonth = daysInMonthKey(model.selectedMonth);
  const ozonElapsedDays = ozonPlanFactRows.length
    || new Set(ozonSmartDailyRows.map((row) => row.date)).size
    || numberOrZero(ozonFinance.window?.days)
    || new Set((ozonPlan.daily || []).filter((row) => row.monthKey === model.selectedMonth && (numberOrZero(row.gmv) || numberOrZero(row.ads))).map((row) => row.date)).size;
  const ozonPlanToDateGmv = numberOrZero(ozonPlanFactLastRow.cumulativeTargetGmv)
    || (ozonDaysInMonth > 0 ? ozonMonthTargetGmv * Math.min(ozonElapsedDays || ozonDaysInMonth, ozonDaysInMonth) / ozonDaysInMonth : 0);
  const ozonFactGmvBoth = numberOrZero(ozonPlanFactLastRow.cumulativeFactGmv)
    || numberOrZero(ozonSmartRevenue || ozonAllocation.smartAllocatedRevenue || ozonPlanTotals.revenue || ozonFinanceMonth.salesGross);
  const ozonFactAdsBoth = numberOrZero(ozonPlanFactLastRow.cumulativeFactAds)
    || numberOrZero(ozonSmartAds || ozonAllocation.smartAllocatedAds || ozonPlanTotals.ads || ozonAdsAbs);
  const ozonPlanCompletionToDate = ozonPlanToDateGmv > 0 ? ozonFactGmvBoth / ozonPlanToDateGmv : null;
  const ozonPlanCompletionMonth = ozonMonthTargetGmv > 0 ? ozonFactGmvBoth / ozonMonthTargetGmv : null;
  const ozonPlanDeltaToDate = ozonPlanFactLastRow.cumulativeGmvDelta !== undefined
    ? numberOrZero(ozonPlanFactLastRow.cumulativeGmvDelta)
    : ozonFactGmvBoth - ozonPlanToDateGmv;
  const ozonPlanFactDrr = ozonFactGmvBoth > 0 ? ozonFactAdsBoth / ozonFactGmvBoth : null;
  const ozonAdsPlanToDate = ozonPlanToDateGmv * ozonTargetDrr;
  const ozonAdsPlanMonth = ozonMonthTargetGmv * ozonTargetDrr;
  const ozonAdsDeltaToDate = ozonPlanFactLastRow.cumulativeAdsDelta !== undefined
    ? numberOrZero(ozonPlanFactLastRow.cumulativeAdsDelta)
    : ozonFactAdsBoth - ozonAdsPlanToDate;
  const ozonAdsCompletionToDate = ozonAdsPlanToDate > 0 ? ozonFactAdsBoth / ozonAdsPlanToDate : null;
  const ozonPlanAdBudgetByFact = ozonFactGmvBoth * ozonTargetDrr;
  const ozonPlanAdReserve = ozonPlanAdBudgetByFact - ozonFactAdsBoth;
  const ozonSmartShareAds = ozonFactAdsBoth;
  const ozonSmartShareGmv = numberOrZero(ozonSmartGmv || ozonAllocation.smartAllocatedGmv || (ozonFactGmvBoth * ozonSmartShare));
  const ozonFinanceApiSourceLabel = ozonFinance.source?.sourceMode === 'api'
    ? [
      `Ozon API ${ozonFinance.source?.endpoint || '/v3/finance/transaction/list'}`,
      ozonFinance.source?.fetchedRows ? `${fmt.int(ozonFinance.source.fetchedRows)} rows` : '',
      ozonFinance.source?.apiRowCount && ozonFinance.source.apiRowCount !== ozonFinance.source.fetchedRows ? `API row_count ${fmt.int(ozonFinance.source.apiRowCount)}` : ''
    ].filter(Boolean).join(' · ')
    : '';
  const ozonFinanceSourceLabel = [
    ozonFinanceApiSourceLabel || ozonFinance.source?.financeFile,
    ozonFinance.source?.productsFile,
    ozonPlan.source?.planFile
  ].filter(Boolean).join(' + ');
  const ozonFinanceKpisHtmlLegacy = `
    <div class="kpi-strip" style="margin-top:14px">
      <div class="mini-kpi ${ozonPlanCompletionToDate != null && ozonPlanCompletionToDate >= 1 ? 'ok' : 'warn'}"><span>План-факт GMV</span><strong>${ozonPlanCompletionToDate != null ? fmt.pct(ozonPlanCompletionToDate) : '—'}</strong><span>${fmt.money(ozonFactGmvBoth)} / ${fmt.money(ozonPlanToDateGmv)}</span></div>
      <div class="mini-kpi"><span>План месяца</span><strong>${fmt.money(ozonMonthTargetGmv)}</strong><span>${fmt.pct(ozonPlanCompletionMonth)} от месяца</span></div>
      <div class="mini-kpi ${ozonPlanFactDrr != null && ozonPlanFactDrr <= ozonTargetDrr ? 'ok' : 'warn'}"><span>ИУ оба кабинета</span><strong>${fmt.money(ozonFactAdsBoth)}</strong><span>ДРР ${ozonPlanFactDrr != null ? fmt.pct(ozonPlanFactDrr) : '—'} / цель ${fmt.pct(ozonTargetDrr)}</span></div>
      <div class="mini-kpi ok"><span>Наша доля 40%</span><strong>${fmt.money(ozonSmartShareAds)}</strong><span>GMV доля ${fmt.money(ozonSmartShareGmv)}</span></div>
      <div class="mini-kpi"><span>Начислено по отчету Ozon</span><strong>${fmt.money(ozonFinanceMonth.accruedNet)}</strong><span>продажи ${fmt.money(ozonFinanceMonth.salesGross)}</span></div>
      <div class="mini-kpi ${ozonDrr != null && ozonDrr <= ozonTargetDrr ? 'ok' : 'warn'}"><span>Реклама по отчету Ozon</span><strong>${fmt.money(ozonAdsAbs)}</strong><span>ДРР ${ozonDrr != null ? fmt.pct(ozonDrr) : '—'}</span></div>
      <div class="mini-kpi ${ozonControlTone}"><span>Расхождение со скрином</span><strong>${ozonControlDelta === null || ozonControlDelta === undefined ? '—' : fmt.money(ozonControlDelta)}</strong><span>${ozonControl.sellerUiAccruedNet == null ? 'нет контроля' : fmt.money(ozonControl.sellerUiAccruedNet)}</span></div>
    </div>
  `;
  void ozonFinanceKpisHtmlLegacy;
  const ozonFinanceKpisHtml = `
    <div class="kpi-strip" style="margin-top:14px">
      <div class="mini-kpi ${ozonPlanCompletionToDate != null && ozonPlanCompletionToDate >= 1 ? 'ok' : 'warn'}"><span>Оборот план-факт</span><strong>${ozonPlanCompletionToDate != null ? fmt.pct(ozonPlanCompletionToDate) : '—'}</strong><span>${fmt.money(ozonFactGmvBoth)} / ${fmt.money(ozonPlanToDateGmv)}</span></div>
      <div class="mini-kpi ${iuDrrToneForRevenueDelta(ozonPlanDeltaToDate)}"><span>Отклонение оборота</span><strong>${fmt.money(ozonPlanDeltaToDate)}</strong><span>план месяца ${fmt.money(ozonMonthTargetGmv)}</span></div>
      <div class="mini-kpi ${ozonAdsCompletionToDate != null && ozonAdsCompletionToDate <= 1 ? 'ok' : 'warn'}"><span>Реклама план-факт</span><strong>${ozonAdsCompletionToDate != null ? fmt.pct(ozonAdsCompletionToDate) : '—'}</strong><span>${fmt.money(ozonFactAdsBoth)} / ${fmt.money(ozonAdsPlanToDate)}</span></div>
      <div class="mini-kpi ${iuDrrToneForDelta(ozonAdsDeltaToDate)}"><span>Отклонение рекламы</span><strong>${fmt.money(ozonAdsDeltaToDate)}</strong><span>цель ДРР ${fmt.pct(ozonTargetDrr)}</span></div>
      <div class="mini-kpi ok"><span>Наша доля 40%</span><strong>${fmt.money(ozonSmartShareAds)}</strong><span>GMV доля ${fmt.money(ozonSmartShareGmv)}</span></div>
      <div class="mini-kpi"><span>Начислено по отчету Ozon</span><strong>${fmt.money(ozonFinanceMonth.accruedNet)}</strong><span>продажи ${fmt.money(ozonFinanceMonth.salesGross)}</span></div>
      <div class="mini-kpi ${ozonControlTone}"><span>Расхождение со скрином</span><strong>${ozonControlDelta === null || ozonControlDelta === undefined ? '—' : fmt.money(ozonControlDelta)}</strong><span>${ozonControl.sellerUiAccruedNet == null ? 'нет контроля' : fmt.money(ozonControl.sellerUiAccruedNet)}</span></div>
    </div>
  `;
  const ozonFinanceChartsHtmlLegacy = `
    <div class="dashboard-grid-3" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead">
          <div><h3>План-факт GMV</h3><p class="small muted">${fmt.int(ozonElapsedDays)} из ${fmt.int(ozonDaysInMonth)} дней месяца</p></div>
          ${badge(ozonPlanCompletionToDate != null ? fmt.pct(ozonPlanCompletionToDate) : '—', ozonPlanCompletionToDate != null && ozonPlanCompletionToDate >= 1 ? 'ok' : 'warn')}
        </div>
        <div class="kpi-strip" style="margin-top:10px">
          <div class="mini-kpi"><span>Факт GMV</span><strong>${fmt.money(ozonFactGmvBoth)}</strong><span>оба кабинета</span></div>
          <div class="mini-kpi"><span>План к дате</span><strong>${fmt.money(ozonPlanToDateGmv)}</strong><span>${fmt.money(ozonPlanDeltaToDate)}</span></div>
        </div>
      </div>
      <div class="card">
        <div class="section-subhead">
          <div><h3>ИУ и ДРР</h3><p class="small muted">факт двух кабинетов против целевой ставки</p></div>
          ${badge(ozonPlanFactDrr != null ? fmt.pct(ozonPlanFactDrr) : '—', ozonPlanFactDrr != null && ozonPlanFactDrr <= ozonTargetDrr ? 'ok' : 'warn')}
        </div>
        <div class="kpi-strip" style="margin-top:10px">
          <div class="mini-kpi"><span>ИУ факт</span><strong>${fmt.money(ozonFactAdsBoth)}</strong><span>резерв ${fmt.money(ozonPlanAdReserve)}</span></div>
          <div class="mini-kpi"><span>Бюджет от факта</span><strong>${fmt.money(ozonPlanAdBudgetByFact)}</strong><span>${fmt.pct(ozonTargetDrr)} от GMV</span></div>
        </div>
      </div>
      <div class="card">
        <div class="section-subhead">
          <div><h3>Сверка начислений</h3><p class="small muted">начислено, реклама и комиссии из финансового отчета Ozon</p></div>
          ${badge(fmt.money(ozonFinanceMonth.accruedNet), 'ok')}
        </div>
        <div class="kpi-strip" style="margin-top:10px">
          <div class="mini-kpi"><span>Реклама по отчету Ozon</span><strong>${fmt.money(ozonAdsAbs)}</strong><span>ДРР ${ozonDrr != null ? fmt.pct(ozonDrr) : '—'}</span></div>
          <div class="mini-kpi warn"><span>Комиссии + логистика</span><strong>${fmt.money(ozonFinanceMonth.ozonReward + ozonFinanceMonth.deliveryServices)}</strong><span>net ${fmt.money(ozonSalesNet)}</span></div>
        </div>
      </div>
    </div>
  `;
  void ozonFinanceChartsHtmlLegacy;
  const ozonFinanceChartsHtml = `
    <div class="dashboard-grid-3" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead">
          <div><h3>Оборот накопительно</h3><p class="small muted">${fmt.int(ozonElapsedDays)} из ${fmt.int(ozonDaysInMonth)} дней месяца</p></div>
          ${badge(ozonPlanCompletionToDate != null ? fmt.pct(ozonPlanCompletionToDate) : '—', ozonPlanCompletionToDate != null && ozonPlanCompletionToDate >= 1 ? 'ok' : 'warn')}
        </div>
        <div class="kpi-strip" style="margin-top:10px">
          <div class="mini-kpi"><span>План к дате</span><strong>${fmt.money(ozonPlanToDateGmv)}</strong><span>месяц ${fmt.money(ozonMonthTargetGmv)}</span></div>
          <div class="mini-kpi"><span>Факт</span><strong>${fmt.money(ozonFactGmvBoth)}</strong><span>оба кабинета</span></div>
          <div class="mini-kpi ${iuDrrToneForRevenueDelta(ozonPlanDeltaToDate)}"><span>Отклонение</span><strong>${fmt.money(ozonPlanDeltaToDate)}</strong><span>${ozonPlanCompletionToDate != null ? fmt.pct(ozonPlanCompletionToDate) : '—'}</span></div>
        </div>
      </div>
      <div class="card">
        <div class="section-subhead">
          <div><h3>Реклама накопительно</h3><p class="small muted">план считается от GMV к дате × ${fmt.pct(ozonTargetDrr)}</p></div>
          ${badge(ozonAdsCompletionToDate != null ? fmt.pct(ozonAdsCompletionToDate) : '—', ozonAdsCompletionToDate != null && ozonAdsCompletionToDate <= 1 ? 'ok' : 'warn')}
        </div>
        <div class="kpi-strip" style="margin-top:10px">
          <div class="mini-kpi"><span>План к дате</span><strong>${fmt.money(ozonAdsPlanToDate)}</strong><span>цель ДРР ${fmt.pct(ozonTargetDrr)}</span></div>
          <div class="mini-kpi"><span>Факт</span><strong>${fmt.money(ozonFactAdsBoth)}</strong><span>ДРР ${ozonPlanFactDrr != null ? fmt.pct(ozonPlanFactDrr) : '—'}</span></div>
          <div class="mini-kpi ${iuDrrToneForDelta(ozonAdsDeltaToDate)}"><span>Отклонение</span><strong>${fmt.money(ozonAdsDeltaToDate)}</strong><span>${ozonAdsCompletionToDate != null ? fmt.pct(ozonAdsCompletionToDate) : '—'}</span></div>
        </div>
      </div>
      <div class="card">
        <div class="section-subhead">
          <div><h3>Сверка начислений</h3><p class="small muted">начислено, реклама и комиссии из финансового API Ozon</p></div>
          ${badge(fmt.money(ozonFinanceMonth.accruedNet), 'ok')}
        </div>
        <div class="kpi-strip" style="margin-top:10px">
          <div class="mini-kpi"><span>Реклама по отчету Ozon</span><strong>${fmt.money(ozonAdsAbs)}</strong><span>ДРР ${ozonDrr != null ? fmt.pct(ozonDrr) : '—'}</span></div>
          <div class="mini-kpi warn"><span>Комиссии + логистика</span><strong>${fmt.money(ozonFinanceMonth.ozonReward + ozonFinanceMonth.deliveryServices)}</strong><span>net ${fmt.money(ozonSalesNet)}</span></div>
        </div>
      </div>
    </div>
  `;
  const extraIuDrrPlatformButtons = PORTAL_MARKETPLACE_KEYS_EXTENDED
    .filter((key) => !PORTAL_MARKETPLACE_CORE_IU_DRR_KEYS.includes(key))
    .map((key) => `
      <button type="button" class="iu-drr-platform-chip iu-drr-platform-chip--${escapeHtml(key)} ${model.selectedPlatform === key ? 'active' : ''}" data-iu-drr-platform="${escapeHtml(key)}" aria-pressed="${model.selectedPlatform === key ? 'true' : 'false'}">
        <span>${escapeHtml(adsFunnelPlatformLabel(key))}</span>
        <strong>${escapeHtml(adsFunnelPlatformLabel(key))}</strong>
        <em>нет источника</em>
      </button>
    `).join('');
  const iuDrrPlatformOptions = PORTAL_MARKETPLACE_KEYS_EXTENDED
    .map((key) => `<option value="${escapeHtml(key)}" ${model.selectedPlatform === key ? 'selected' : ''}>${escapeHtml(adsFunnelPlatformLabel(key))}</option>`)
    .join('');
  const platformSelectHtml = `
    <div class="iu-drr-platform-switch" role="tablist" aria-label="Площадка">
      <button type="button" class="iu-drr-platform-chip iu-drr-platform-chip--wb ${model.selectedPlatform === 'wb' ? 'active' : ''}" data-iu-drr-platform="wb" aria-pressed="${model.selectedPlatform === 'wb' ? 'true' : 'false'}">
        <span>WB</span>
        <strong>Wildberries</strong>
        <em>ИУ + ДРР</em>
      </button>
      <button type="button" class="iu-drr-platform-chip iu-drr-platform-chip--ozon ${model.selectedPlatform === 'ozon' ? 'active' : ''}" data-iu-drr-platform="ozon" aria-pressed="${model.selectedPlatform === 'ozon' ? 'true' : 'false'}">
        <span>OZ</span>
        <strong>Ozon</strong>
        <em>Smart 40%</em>
      </button>
      <button type="button" class="iu-drr-platform-chip iu-drr-platform-chip--ya ${model.selectedPlatform === 'ya' ? 'active' : ''}" data-iu-drr-platform="ya" aria-pressed="${model.selectedPlatform === 'ya' ? 'true' : 'false'}">
        <span>YA</span>
        <strong>Я.Маркет</strong>
        <em>funnel API</em>
      </button>
      ${extraIuDrrPlatformButtons}
    </div>
    <select id="iuDrrPlatform" class="iu-drr-platform-select-fallback" aria-label="Площадка">
      ${iuDrrPlatformOptions}
    </select>
  `;
  const quarter = model.quarterSummary || {};
  const quarterTargetWb = numberOrZero(quarter.targetRevenueWb);
  const quarterRevenueFactWb = numberOrZero(quarter.revenueWb || quarter.adsPctBaseWb || quarter.ordersRevenueWb);
  const quarterRevenueDeltaDisplay = quarterRevenueFactWb - quarterTargetWb;
  const quarterRevenueCompletionDisplay = quarterTargetWb > 0 ? quarterRevenueFactWb / quarterTargetWb : quarter.revenueCompletionPct;
  const quarterAvailable = numberOrZero(quarter.days) > 0 || quarterRevenueFactWb > 0 || numberOrZero(quarter.spendFact) > 0;
  const quarterCompletionTone = iuDrrFunnelCompletionTone(quarterRevenueCompletionDisplay);
  const quarterAdsCompletionDisplay = numberOrZero(quarter.planSpendWb) > 0 ? numberOrZero(quarter.spendFact) / numberOrZero(quarter.planSpendWb) : null;
  const quarterAdsTone = iuDrrFunnelAdsCompletionTone(quarterAdsCompletionDisplay);
  const quarterDrrTone = iuDrrFunnelDrrTone(quarter.factPct, quarter.planPct);
  const quarterOrdersAdTone = iuDrrFunnelDrrTone(quarter.ordersAdPct, quarter.planPct);
  const quarterRevenueTone = iuDrrToneForRevenueDelta(quarterRevenueDeltaDisplay);
  const quarterSpendTone = quarterAdsTone;
  const quarterPeriodLabel = quarter.label || `${String(quarter.from || '').slice(8, 10)}.${String(quarter.from || '').slice(5, 7)}–${String(quarter.to || '').slice(8, 10)}.${String(quarter.to || '').slice(5, 7)}`;
  const quarterProgressWidth = Math.min(100, Math.max(0, numberOrZero(quarterRevenueCompletionDisplay) * 100)).toFixed(1);
  const quarterRevenueDeltaText = `${quarterRevenueDeltaDisplay >= 0 ? '+' : ''}${fmt.money(quarterRevenueDeltaDisplay)}`;
  const quarterSpendDeltaText = `${numberOrZero(quarter.spendDelta) >= 0 ? '+' : ''}${fmt.money(quarter.spendDelta)}`;
  const quarterGameCardsHtml = quarterAvailable ? [
    {
      label: 'Оборот ИУ',
      value: fmt.pct(quarterRevenueCompletionDisplay),
      detail: `${fmt.money(quarterRevenueFactWb)} / ${fmt.money(quarterTargetWb)}`,
      progress: quarterRevenueCompletionDisplay,
      tone: quarterCompletionTone
    },
    {
      label: 'Дельта оборота',
      value: quarterRevenueDeltaText,
      detail: quarterRevenueFactWb >= quarterTargetWb ? 'выше ИУ' : 'ниже ИУ',
      progress: quarterRevenueCompletionDisplay,
      tone: quarterRevenueTone
    },
    {
      label: 'Реклама ИУ',
      value: fmt.pct(quarterAdsCompletionDisplay),
      detail: `${fmt.money(quarter.spendFact)} / ${fmt.money(quarter.planSpendWb)}`,
      progress: quarterAdsCompletionDisplay,
      tone: quarterAdsTone
    },
    {
      label: 'ДРР договор',
      value: fmt.pct(quarter.factPct),
      detail: `цель ${fmt.pct(quarter.planPct)}`,
      progress: quarter.planPct > 0 && quarter.factPct != null ? quarter.factPct / quarter.planPct : null,
      tone: quarterDrrTone
    },
    {
      label: '% от заказов',
      value: fmt.pct(quarter.ordersAdPct),
      detail: `${fmt.money(quarter.ordersRevenueWb)}`,
      progress: quarter.planPct > 0 && quarter.ordersAdPct != null ? quarter.ordersAdPct / quarter.planPct : null,
      tone: quarterOrdersAdTone
    }
  ].map((card) => iuDrrScoreCardHtml(card, 'iu-drr-quarter-score-card')).join('') : '';
  const quarterSummaryHtml = quarterAvailable ? `
    <div class="iu-drr-quarter-card ${escapeHtml(quarterCompletionTone)}" style="--iu-quarter-progress:${quarterProgressWidth}%">
      <div class="iu-drr-quarter-head">
        <div>
          <h3>Накопительно с 01.03</h3>
          <p class="small muted">WB ИУ: оборот, реклама и ДРР в одном накопительном срезе.</p>
        </div>
        <div class="badge-stack">
          ${badge(quarterPeriodLabel, 'info')}
          ${badge(quarter.status === 'partial' ? 'частично' : 'готово', quarter.status === 'partial' ? 'warn' : 'ok')}
          ${badge(`${fmt.int(quarter.days || 0)} дн.`, 'info')}
        </div>
      </div>
      <div class="iu-drr-quarter-hero">
        <div class="iu-drr-quarter-score">
          <span>уровень ИУ WB</span>
          <strong>${fmt.pct(quarterRevenueCompletionDisplay)}</strong>
          <em>${iuDrrScoreStatusLabel(quarterCompletionTone)}</em>
        </div>
        <div class="iu-drr-quarter-track" title="${escapeHtml(`${fmt.money(quarterRevenueFactWb)} / ${fmt.money(quarterTargetWb)}`)}">
          <i></i>
          <span class="iu-drr-quarter-mark mark-80">80%</span>
          <span class="iu-drr-quarter-mark mark-90">90%</span>
          <span class="iu-drr-quarter-mark mark-100">100%</span>
        </div>
        <div class="iu-drr-quarter-delta ${escapeHtml(quarterRevenueTone)}">
          <span>разница к ИУ</span>
          <strong>${quarterRevenueDeltaText}</strong>
          <em>${fmt.money(quarterRevenueFactWb)} / ${fmt.money(quarterTargetWb)}</em>
        </div>
      </div>
      <div class="iu-drr-quarter-cards">
        ${quarterGameCardsHtml}
      </div>
      <div class="iu-drr-quarter-foot">
        <span>Реклама: ${fmt.money(quarter.spendFact)} / ${fmt.money(quarter.planSpendWb)}</span>
        <span class="${escapeHtml(quarterAdsTone)}">выполнение ${fmt.pct(quarterAdsCompletionDisplay)}</span>
        <span class="${escapeHtml(quarterSpendTone)}">Δ рекламы ${quarterSpendDeltaText}</span>
      </div>
    </div>
  ` : '';
  const selectedKpisHtml = '';
  const chartsHtml = isOzonView ? `
    <div class="dashboard-grid-3" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead">
          <div><h3>Ozon оборот на дату</h3><p class="small muted">дневной факт против плана к дате; квартальный вывод выше</p></div>
          ${badge(fmt.pct(platformMeta.completion), platformIuTone)}
        </div>
        ${iuDrrSparkline(model.dailyRows, 'revenueOzon', platformIuTone)}
      </div>
      <div class="card">
        <div class="section-subhead">
          <div><h3>План Ozon</h3><p class="small muted">дневной целевой оборот</p></div>
          ${badge(fmt.money(platformMeta.targetRevenue), 'info')}
        </div>
        ${iuDrrSparkline(model.dailyRows, 'targetRevenueOzon', 'ok')}
      </div>
      <div class="card">
        <div class="section-subhead">
          <div><h3>Реклама Ozon расчет</h3><p class="small muted">${fmt.pct(platformMeta.adsPlanPct)} от фактического оборота; не API-факт</p></div>
          ${badge(fmt.money(platformMeta.adsFact), ozonAdsDeltaTone)}
        </div>
        ${iuDrrSparkline(model.dailyRows, 'spendFactOzon', ozonAdsDeltaTone)}
      </div>
    </div>
  ` : `
    <div class="dashboard-grid-3" style="margin-top:14px">
      <div class="card">
        <div class="section-subhead">
          <div><h3>WB оборот на дату</h3><p class="small muted">дневной факт против плана к дате; квартальный вывод выше</p></div>
          ${badge(fmt.pct(platformMeta.completion), platformIuTone)}
        </div>
        ${iuDrrSparkline(model.dailyRows, 'iuRevenueWb', platformIuTone)}
      </div>
      <div class="card">
        <div class="section-subhead">
          <div><h3>Расход ДРР WB</h3><p class="small muted">без Внешки, факт против дневной нормы</p></div>
          ${badge(fmt.money(month.spendFact), deltaTone)}
        </div>
        ${iuDrrSparkline(model.dailyRows, 'spendFact', deltaTone)}
      </div>
      <div class="card">
        <div class="section-subhead">
          <div><h3>Дельта расхода</h3><p class="small muted">факт ДРР WB минус план</p></div>
          ${badge(fmt.money(month.spendDelta), deltaTone)}
        </div>
        ${iuDrrSparkline(model.dailyRows, 'spendDelta', deltaTone)}
      </div>
    </div>
  `;
  const channelRowsHtml = isOzonView ? '' : `
    <div class="dashboard-grid-4" style="margin-top:14px">
      ${model.channelRows.map((channel) => `
        <div class="mini-kpi ${channel.source === 'WB Promotion API' ? 'ok' : 'warn'}">
          <span>${escapeHtml(channel.label)}</span>
          <strong>${fmt.money(channel.spend)}</strong>
          <span>${escapeHtml(channel.source || '')}</span>
        </div>
      `).join('')}
    </div>
  `;
  const wbDailyRows = model.dailyRows || [];
  const wbPlanToDate = wbDailyRows.reduce((sum, row) => sum + numberOrZero(row.iuTargetRevenueWb || row.targetRevenueWb), 0);
  const wbFactToDate = wbDailyRows.reduce((sum, row) => sum + numberOrZero(row.wbApiRevenue || row.iuRevenueWb || row.revenueWb || row.iuOrdersRevenueWb || row.ordersRevenueWb), 0);
  const wbPlanMonth = numberOrZero(month.iuRevenueWbIuMin || month.iuRevenueWbPlan) || wbPlanToDate;
  const wbFactMonth = numberOrZero(month.iuRevenueWbFactToDate || month.revenueWb) || wbFactToDate;
  const wbCompletionMonth = wbPlanMonth > 0 ? wbFactMonth / wbPlanMonth : platformMeta.completion;
  const wbAdsPlanToDate = wbDailyRows.reduce((sum, row) => sum + numberOrZero(row.iuPlanSpendWb || row.planSpendWb), 0);
  const wbAdsFactToDate = wbDailyRows.reduce((sum, row) => sum + numberOrZero(row.wbApiSpendFact || row.spendFact), 0);
  const wbAdsPlanMonth = numberOrZero(month.iuAdsPlan || month.planSpendWb) || wbAdsPlanToDate;
  const wbAdsFactMonth = numberOrZero(month.iuAdsFactWbToDate || month.spendFactDrr || month.spendFact) || wbAdsFactToDate;
  const wbAdsCompletionMonth = wbAdsPlanMonth > 0 ? wbAdsFactMonth / wbAdsPlanMonth : null;
  const wbDrrMonth = wbFactMonth > 0 ? wbAdsFactMonth / wbFactMonth : factDrr;
  const wbRevenueDeltaMonth = wbFactMonth - wbPlanMonth;
  const wbAdsDeltaMonth = wbAdsFactMonth - wbAdsPlanMonth;
  const wbExternalToDate = wbDailyRows.reduce((sum, row) => sum + numberOrZero(row.externalAds), 0) || externalSpend;
  const wbProgressCell = (value, tone = 'info') => {
    const progress = iuDrrFunnelFinite(value) ? Math.max(0, Math.min(1.35, Number(value))) : 0;
    return `
      <div class="iu-drr-progress-cell ${escapeHtml(tone)}" style="--iu-drr-progress:${Math.min(100, progress * 100).toFixed(1)}%">
        <strong>${value == null ? '—' : fmt.pct(value)}</strong>
        <span><i></i></span>
      </div>
    `;
  };
  const wbPlanCardsHtml = [
    {
      label: 'Оборот WB за месяц',
      value: wbCompletionMonth == null ? '—' : fmt.pct(wbCompletionMonth),
      detail: `${fmt.money(wbFactMonth)} / ${fmt.money(wbPlanMonth)}`,
      progress: wbCompletionMonth,
      tone: iuDrrFunnelCompletionTone(wbCompletionMonth),
      status: 'месячный ИУ-план'
    },
    {
      label: 'Реклама WB за месяц',
      value: wbAdsCompletionMonth == null ? '—' : fmt.pct(wbAdsCompletionMonth),
      detail: `${fmt.money(wbAdsFactMonth)} / ${fmt.money(wbAdsPlanMonth)}`,
      progress: wbAdsCompletionMonth,
      tone: iuDrrFunnelAdsCompletionTone(wbAdsCompletionMonth),
      status: iuDrrAdsBudgetStatus(wbAdsCompletionMonth)
    },
    {
      label: 'ДРР факт',
      value: wbDrrMonth == null ? '—' : fmt.pct(wbDrrMonth),
      detail: `цель ${fmt.pct(month.planPct)}`,
      progress: month.planPct > 0 && wbDrrMonth != null ? wbDrrMonth / month.planPct : null,
      tone: iuDrrFunnelDrrTone(wbDrrMonth, month.planPct)
    },
    {
      label: 'Отклонение к ИУ',
      value: `${wbRevenueDeltaMonth >= 0 ? '+' : ''}${fmt.money(wbRevenueDeltaMonth)}`,
      detail: wbCompletionMonth == null ? 'нет плана' : fmt.pct(wbCompletionMonth),
      progress: wbCompletionMonth,
      tone: iuDrrToneForRevenueDelta(wbRevenueDeltaMonth)
    },
    {
      label: 'Отклонение рекламы',
      value: `${wbAdsDeltaMonth >= 0 ? '+' : ''}${fmt.money(wbAdsDeltaMonth)}`,
      detail: wbAdsCompletionMonth == null ? 'нет плана' : fmt.pct(wbAdsCompletionMonth),
      progress: wbAdsCompletionMonth,
      tone: iuDrrFunnelAdsCompletionTone(wbAdsCompletionMonth),
      status: iuDrrAdsBudgetStatus(wbAdsCompletionMonth)
    },
    {
      label: 'Внешний трафик',
      value: fmt.money(wbExternalToDate),
      detail: 'отдельно, не в ДРР',
      progress: null,
      tone: wbExternalToDate > 0 ? 'warn' : 'ok'
    }
  ].map((card) => iuDrrScoreCardHtml(card, 'iu-drr-score-card--wb')).join('');
  const dailyTableHtml = isOzonView ? `
    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div><h3>Дневная форма Ozon</h3><p class="small muted">Отдельный план-факт оборота Ozon по дням.</p></div>
        ${badge(model.hasRows ? 'готово' : 'нет строк', model.hasRows ? 'ok' : 'warn')}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Период</th>
              <th>Целевой оборот Ozon</th>
              <th>Продажи. Фактический оборот Ozon</th>
              <th>Разница оборота</th>
              <th>Выполнение</th>
              <th>Реклама. План в %</th>
              <th>План расхода Ozon</th>
              <th>Реклама. Расчетный расход ${fmt.pct(platformMeta.adsPlanPct)}</th>
              <th>Расчетная ставка</th>
              <th>Дельта расчетного расхода</th>
            </tr>
          </thead>
          <tbody>
            ${model.dailyRows.map((row) => `
              <tr>
                <td><strong>${escapeHtml(row.period || row.date)}</strong><div class="muted small">${escapeHtml(row.date)}</div></td>
                <td>${fmt.money(row.targetRevenueOzon)}</td>
                <td>${fmt.money(row.revenueOzon)}</td>
                <td>${badge(fmt.money(row.revenueOzonDelta), iuDrrToneForRevenueDelta(row.revenueOzonDelta))}</td>
                <td>${row.revenueOzonCompletionPct != null ? fmt.pct(row.revenueOzonCompletionPct) : '—'}</td>
                <td>${fmt.pct(row.planPctOzon)}</td>
                <td>${fmt.money(row.planSpendOzon)}</td>
                <td>${fmt.money(row.spendFactOzon)}</td>
                <td>${row.factPctOzon != null ? fmt.pct(row.factPctOzon) : '—'}</td>
                <td>${badge(fmt.money(row.spendDeltaOzon), iuDrrToneForDelta(row.spendDeltaOzon))}</td>
              </tr>
            `).join('') || '<tr><td colspan="10">Нет данных по выбранному месяцу.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  ` : `
    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div><h3>Форма ИУ WB: план-факт</h3><p class="small muted">Оборот, реклама, выполнение и ДРР по дням; Внешка исключена из факта ДРР и дельты.</p></div>
        ${badge(model.hasRows ? 'готово' : 'нет строк', model.hasRows ? 'ok' : 'warn')}
      </div>
      <div class="iu-drr-funnel-cards iu-drr-wb-plan-cards">${wbPlanCardsHtml}</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Период</th>
              <th>Целевой оборот WB</th>
              <th>Продажи. Фактический оборот WB</th>
              <th>Разница оборота</th>
              <th>Выполнение оборота</th>
              <th>Реклама. План в %</th>
              <th>План расхода</th>
              <th>Реклама. Фактические затраты</th>
              <th>Выполнение рекламы</th>
              <th>Реклама. Факт в % по договору</th>
              <th>ВБ Продвижение</th>
              <th>ВБ Медиа</th>
              <th>ВБ Инфлюенс</th>
              <th>Реклама в ПВЗ</th>
              <th>Брендзона</th>
              <th>Обзоры</th>
              <th>Отзывы за баллы</th>
              <th>Внешка</th>
              <th>Дельта расхода по ИУ</th>
            </tr>
          </thead>
          <tbody>
            ${model.dailyRows.map((row) => {
              const rowPlanRevenue = numberOrZero(row.iuTargetRevenueWb || row.targetRevenueWb);
              const rowFactRevenue = numberOrZero(row.wbApiRevenue || row.iuRevenueWb || row.revenueWb || row.iuOrdersRevenueWb || row.ordersRevenueWb);
              const rowRevenueCompletion = rowPlanRevenue > 0 ? rowFactRevenue / rowPlanRevenue : row.iuRevenueWbCompletionPct;
              const rowPlanAds = numberOrZero(row.iuPlanSpendWb || row.planSpendWb);
              const rowFactAds = numberOrZero(row.wbApiSpendFact || row.spendFact);
              const rowAdsCompletion = rowPlanAds > 0 ? rowFactAds / rowPlanAds : null;
              const rowDrr = row.iuFactPct != null ? row.iuFactPct : (rowFactRevenue > 0 ? rowFactAds / rowFactRevenue : null);
              return `
                <tr>
                  <td><strong>${escapeHtml(row.period || row.date)}</strong><div class="muted small">${escapeHtml(row.date)}</div></td>
                  <td>${fmt.money(rowPlanRevenue)}</td>
                  <td>${fmt.money(rowFactRevenue)}</td>
                  <td>${badge(fmt.money(row.iuRevenueWbDelta), iuDrrToneForRevenueDelta(row.iuRevenueWbDelta))}</td>
                  <td>${wbProgressCell(rowRevenueCompletion, iuDrrFunnelCompletionTone(rowRevenueCompletion))}</td>
                  <td>${fmt.pct(row.planPct)}</td>
                  <td>${fmt.money(rowPlanAds)}</td>
                  <td>${fmt.money(rowFactAds)}</td>
                  <td>${wbProgressCell(rowAdsCompletion, iuDrrFunnelAdsCompletionTone(rowAdsCompletion))}</td>
                  <td>${badge(rowDrr != null ? fmt.pct(rowDrr) : '—', iuDrrFunnelDrrTone(rowDrr, row.planPct))}</td>
                  <td>${fmt.money(row.wbPromotion)}</td>
                  <td>${fmt.money(row.wbMedia)}</td>
                  <td>${fmt.money(row.wbInfluencer)}</td>
                  <td>${fmt.money(row.pvzAds)}</td>
                  <td>${fmt.money(row.brandZone)}</td>
                  <td>${fmt.money(row.overviews)}</td>
                  <td>${fmt.money(row.reviewPoints)}</td>
                  <td>${fmt.money(row.externalAds)}</td>
                  <td>${badge(fmt.money(row.iuSpendDelta), iuDrrFunnelAdsCompletionTone(rowAdsCompletion))}</td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="19">Нет данных по выбранному месяцу.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
  void ozonFinanceSourceLabel;
  const ozonIuAccountCardsHtml = renderOzonIuAccountCards(model, { smartShare: ozonSmartShare, targetDrr: ozonTargetDrr });
  const ozonNoSppBuyoutsToDate = numberOrZero(ozonPlanFactLastRow.cumulativeNoSppBuyouts);
  const ozonNoSppAdsToDate = numberOrZero(ozonPlanFactLastRow.cumulativeNoSppAds);
  const ozonNoSppDrrToDate = ozonNoSppBuyoutsToDate > 0 ? ozonNoSppAdsToDate / ozonNoSppBuyoutsToDate : null;
  const ozonPlanFactTableHtml = renderOzonIuPlanFactTable(model, {
    monthTargetGmv: ozonMonthTargetGmv,
    smartShare: ozonSmartShare,
    targetDrr: ozonTargetDrr,
    rows: ozonPlanFactRows
  });
  const iuDrrQuarterForecastModel = iuDrrBuildQuarterForecast(model, { ozonPlanFactRows });
  const iuDrrQuarterForecastHtml = renderIuDrrQuarterForecastPanel(iuDrrQuarterForecastModel);
  const iuDrrFunnelContext = {
    ozonPlanFactRows,
    ozonTargetDrr,
    ozonAdRevKpiRate,
    quarterForecast: iuDrrQuarterForecastModel
  };
  const iuDrrFunnelModel = iuDrrFunnelBuildModel(model, iuDrrFunnelContext);
  const iuDrrFunnelHtml = renderIuDrrFunnelPanel(iuDrrFunnelModel, iuDrrFunnelContext);
  const formatOzonSummaryValue = (row, value) => {
    if (value === null || value === undefined || value === '') return '—';
    return row.type === 'rate' ? fmt.pct(value) : fmt.money(value);
  };
  const formatOzonSummaryDelta = (row, value) => {
    if (value === null || value === undefined || value === '') return '—';
    if (row.type !== 'rate') return fmt.money(value);
    const points = Math.round(numberOrZero(value) * 10000) / 100;
    return `${points > 0 ? '+' : ''}${points} п.п.`;
  };
  const ozonSummaryRows = [
    {
      label: 'Smart оборот к плану портала',
      detail: `рабочий план портала на месяц ${fmt.money(ozonMonthTargetGmv)}`,
      monthPlan: ozonMonthTargetGmv,
      plan: ozonPlanToDateGmv,
      fact: ozonFactGmvBoth,
      completion: ozonPlanCompletionToDate,
      delta: ozonPlanDeltaToDate,
      tone: iuDrrToneForRevenueDelta(ozonPlanDeltaToDate)
    },
    {
      label: 'Smart реклама к плану',
      detail: `рабочий план рекламы на месяц ${fmt.money(ozonAdsPlanMonth)}`,
      monthPlan: ozonAdsPlanMonth,
      plan: ozonAdsPlanToDate,
      fact: ozonFactAdsBoth,
      completion: ozonAdsCompletionToDate,
      delta: ozonAdsDeltaToDate,
      tone: iuDrrToneForDelta(ozonAdsDeltaToDate)
    },
    {
      label: 'ДРР Ozon без СПП',
      detail: `РК ${fmt.money(ozonNoSppAdsToDate)} / выкупы без СПП ${fmt.money(ozonNoSppBuyoutsToDate)}`,
      type: 'rate',
      monthPlan: ozonAdRevKpiRate,
      plan: ozonAdRevKpiRate,
      fact: ozonNoSppDrrToDate,
      completionLabel: ozonNoSppDrrToDate == null ? '—' : (ozonNoSppDrrToDate <= ozonAdRevKpiRate ? 'в норме' : 'выше цели'),
      delta: ozonNoSppDrrToDate == null ? null : ozonNoSppDrrToDate - ozonAdRevKpiRate,
      tone: ozonNoSppDrrToDate == null ? 'info' : (ozonNoSppDrrToDate <= ozonAdRevKpiRate ? 'ok' : 'warn')
    },
    {
      label: 'ДРР / AdRev KPI',
      detail: `договорная цель ${fmt.pct(ozonAdRevKpiRate)}${ozonSppRate ? `, СПП ${fmt.pct(ozonSppRate)}` : ''}`,
      type: 'rate',
      monthPlan: ozonAdRevKpiRate,
      plan: ozonAdRevKpiRate,
      fact: ozonPlanFactDrr,
      completionLabel: ozonPlanFactDrr == null ? '—' : (ozonPlanFactDrr <= ozonAdRevKpiRate ? 'в норме' : 'выше цели'),
      delta: ozonPlanFactDrr == null ? null : ozonPlanFactDrr - ozonAdRevKpiRate,
      tone: ozonPlanFactDrr == null ? 'info' : (ozonPlanFactDrr <= ozonAdRevKpiRate ? 'ok' : 'warn')
    }
  ];
  const ozonReadableSummaryHtml = `
    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Итог Ozon Smart на дату</h3>
          <p class="small muted">${fmt.int(ozonElapsedDays)} из ${fmt.int(ozonDaysInMonth)} дней месяца. Сразу видно выполнение, перерасход и ДРР.</p>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Показатель</th>
              <th>План месяца</th>
              <th>План к дате</th>
              <th>Факт</th>
              <th>Выполнение</th>
              <th>Отклонение</th>
            </tr>
          </thead>
          <tbody>
            ${ozonSummaryRows.map((row) => `
              <tr>
                <td><strong>${escapeHtml(row.label)}</strong><div class="muted small">${escapeHtml(row.detail)}</div></td>
                <td>${formatOzonSummaryValue(row, row.monthPlan)}</td>
                <td>${formatOzonSummaryValue(row, row.plan)}</td>
                <td>${formatOzonSummaryValue(row, row.fact)}</td>
                <td>${row.completionLabel || (row.completion != null ? fmt.pct(row.completion) : '—')}</td>
                <td>${badge(formatOzonSummaryDelta(row, row.delta), row.tone)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  root.innerHTML = `
    <div class="section-title iu-drr-title">
      <div>
        <h2>Показатели площадок</h2>
      </div>
    </div>

    <div class="control-filters iu-drr-toolbar" style="margin-top:12px">
      <select id="iuDrrMonth">
        ${model.monthOptions.map((option) => `<option value="${escapeHtml(option.key)}" ${model.selectedMonth === option.key ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
      </select>
      ${platformSelectHtml}
    </div>

    ${iuDrrQuarterForecastHtml}

    ${isOzonView ? ozonReadableSummaryHtml : selectedKpisHtml}
    ${iuDrrFunnelHtml}
    ${isOzonView ? ozonPlanFactTableHtml : (isYandexView ? '' : dailyTableHtml)}
  `;

  root.querySelector('#iuDrrMonth')?.addEventListener('change', (event) => {
    getIuDrrFilters().month = String(event.target.value || 'latest');
    rerenderCurrentView();
  });
  root.querySelector('#iuDrrPlatform')?.addEventListener('change', (event) => {
    getIuDrrFilters().platform = String(event.target.value || 'wb');
    rerenderCurrentView();
  });
  root.querySelectorAll('[data-iu-drr-platform]').forEach((button) => {
    button.addEventListener('click', () => {
      const platform = String(button.getAttribute('data-iu-drr-platform') || 'wb');
      const select = root.querySelector('#iuDrrPlatform');
      if (select) select.value = platform;
      getIuDrrFilters().platform = platform;
      rerenderCurrentView();
    });
  });
}

function iuDrrDesignNormalizePlatform(value) {
  const key = adsFunnelNormalizePlatformKey(value);
  if (key === 'all') return 'all';
  return PORTAL_MARKETPLACE_KEYS_EXTENDED.includes(key) ? key : 'all';
}

function iuDrrDesignNormalizePlatformLegacy(value) {
  const key = String(value || '').trim().toLowerCase();
  if (['wb', 'wildberries'].includes(key)) return 'wb';
  if (['ozon', 'oz'].includes(key)) return 'ozon';
  if (['ya', 'ym', 'yandex', 'market', 'yandex-market'].includes(key)) return 'ya';
  return 'all';
}

function iuDrrDesignMarketplaceFocus() {
  let stored = 'all';
  try {
    stored = localStorage.getItem('altea.portal.marketplace') || 'all';
  } catch (error) {
    stored = 'all';
  }
  return iuDrrDesignNormalizePlatform(stored);
}

function iuDrrDesignPlatformLabel(key = 'all') {
  return adsFunnelPlatformLabel(key);
  if (key === 'wb') return 'WB';
  if (key === 'ozon') return 'Ozon';
  if (key === 'ya') return 'Я.Маркет';
  return 'Все площадки';
}

function iuDrrDesignSubview() {
  const filters = getIuDrrFilters();
  const value = String(filters.designSubview || 'iu');
  return ['iu', 'funnel', 'sources'].includes(value) ? value : 'iu';
}

function iuDrrDesignModelFor(platform = 'wb', payload = state.iuDrrSummary || {}) {
  const filters = getIuDrrFilters();
  const previousPlatform = filters.platform;
  filters.platform = PORTAL_MARKETPLACE_KEYS_EXTENDED.includes(platform) ? platform : 'wb';
  try {
    return iuDrrBuildModel(payload);
  } finally {
    filters.platform = previousPlatform;
  }
}

function iuDrrDesignRows(model = {}) {
  const monthKey = model.selectedMonth || iuDrrLatestMonth(model.payload || {});
  return (model.payload?.daily || [])
    .filter((row) => row.monthKey === monthKey)
    .sort((left, right) => String(left.date || '').localeCompare(String(right.date || '')));
}

function iuDrrDesignSum(rows = [], getter = () => 0) {
  return rows.reduce((sum, row) => sum + numberOrZero(getter(row)), 0);
}

function iuDrrDesignRatio(numerator, denominator) {
  const base = numberOrZero(denominator);
  return base > 0 ? numberOrZero(numerator) / base : null;
}

function iuDrrDesignSignedMoney(value) {
  if (!iuDrrFunnelFinite(value)) return '—';
  const numeric = Number(value);
  const prefix = numeric > 0 ? '+' : numeric < 0 ? '-' : '';
  return `${prefix}${fmt.money(Math.abs(numeric))}`;
}

function iuDrrDesignFormatValue(metric = {}, value, row = null, group = null) {
  if (group?.key === 'ya' && metric.sourceRequired && !iuDrrDesignYandexHasSource(row ? [row] : group.rows || [])) {
    return 'нет источника';
  }
  if (!iuDrrFunnelFinite(value)) return '—';
  if (metric.format === 'money') return fmt.money(value);
  if (metric.format === 'signedMoney') return iuDrrDesignSignedMoney(value);
  if (metric.format === 'int') return fmt.int(value);
  if (metric.format === 'pct') return fmt.pct(value);
  if (metric.format === 'pctPoint') {
    const points = Number(value) * 100;
    return `${points > 0 ? '+' : ''}${fmt.num(points, 1)} п.п.`;
  }
  return fmt.num(value, 1);
}

function iuDrrDesignTone(metric = {}, value, row = {}, group = {}) {
  if (!iuDrrFunnelFinite(value)) return 'info';
  if (metric.tone) return metric.tone(value, row);
  if (metric.kind === 'completion') return iuDrrFunnelCompletionTone(value);
  if (metric.kind === 'adsCompletion') return iuDrrFunnelAdsCompletionTone(value);
  if (metric.kind === 'revenueDelta') return iuDrrToneForRevenueDelta(value);
  if (metric.kind === 'adsDelta') return iuDrrToneForDelta(value);
  if (metric.kind === 'drr') return iuDrrFunnelDrrTone(value, metric.plan ? metric.plan(row) : null);
  return iuDrrFunnelCellTone(metric, value, row, group.key || 'wb', group.context || {});
}

function iuDrrDesignYandexHasSource(rows = []) {
  return rows.some((row) => (
    numberOrZero(row?.yandexSourceRows) > 0
    || numberOrZero(row?.yandexShows) > 0
    || numberOrZero(row?.yandexClicks) > 0
    || numberOrZero(row?.yandexToCart) > 0
  ));
}

function iuDrrDesignDateLabel(dateKey = '') {
  const date = String(dateKey || '');
  return {
    day: date.slice(8, 10) || date,
    month: date.slice(5, 7) || ''
  };
}

function iuDrrDesignProgressStyle(value, inverse = false) {
  if (!iuDrrFunnelFinite(value)) return '0%';
  const numeric = Math.max(0, Math.min(1.18, Number(value)));
  const width = inverse ? Math.max(0, Math.min(1, 1 - Math.max(0, Number(value) - 1))) : Math.min(1, numeric);
  return `${Math.round(width * 1000) / 10}%`;
}

function iuDrrDesignMetricMatrix({ id = '', title = '', helper = '', groups = [], focus = 'all' } = {}) {
  const dateKeys = [...new Set(groups.flatMap((group) => (group.rows || []).map((row) => row.dateKey || row.date).filter(Boolean)))]
    .sort((left, right) => String(left).localeCompare(String(right)));
  const colSpan = 3 + Math.max(1, dateKeys.length);
  const dateHeaders = dateKeys.map((dateKey) => {
    const date = iuDrrDesignDateLabel(dateKey);
    return `<th class="iu-drr-v2-date-col"><span>${escapeHtml(date.day)}</span><small>${escapeHtml(date.month)}</small></th>`;
  }).join('');
  const body = groups.map((group) => {
    const rowByDate = new Map((group.rows || []).map((row) => [row.dateKey || row.date, row]));
    const mutedClass = focus !== 'all' && focus !== group.key ? ' is-muted' : '';
    const metricRows = (group.metrics || []).map((metric) => {
      const summaryRaw = typeof metric.summary === 'function'
        ? metric.summary(group.rows || [], group)
        : metric.summary !== undefined
          ? metric.summary
        : iuDrrFunnelSummaryValue(metric, group.rows || [], group.key || 'wb', group.context || {});
      const summaryText = metric.summaryText
        ? metric.summaryText(group.rows || [], group)
        : iuDrrDesignFormatValue(metric, summaryRaw, null, group);
      const dailyCells = dateKeys.map((dateKey) => {
        const row = rowByDate.get(dateKey) || {};
        const raw = metric.value
          ? metric.value(row, group)
          : iuDrrFunnelMetricValue(metric, row, group.key || 'wb', group.context || {});
        const tone = iuDrrDesignTone(metric, raw, row, group);
        return `<td class="iu-drr-v2-cell iu-drr-v2-tone-${escapeHtml(tone)}">${iuDrrDesignFormatValue(metric, raw, row, group)}</td>`;
      }).join('');
      return `
        <tr class="${escapeHtml(mutedClass.trim())}">
          <td class="iu-drr-v2-sticky iu-drr-v2-col-metric">
            <strong>${escapeHtml(metric.label || metric.key || '')}</strong>
          </td>
          <td class="iu-drr-v2-sticky iu-drr-v2-col-formula">${escapeHtml(metric.formula || '')}</td>
          <td class="iu-drr-v2-sticky iu-drr-v2-col-summary">${summaryText}</td>
          ${dailyCells}
        </tr>
      `;
    }).join('');
    return `
      <tr class="iu-drr-v2-group-row ${escapeHtml(group.key || '')}${mutedClass}">
        <td colspan="${colSpan}">
          <span>${escapeHtml(group.title || '')}</span>
          <em>${escapeHtml(group.subtitle || '')}</em>
        </td>
      </tr>
      ${metricRows}
    `;
  }).join('');
  return `
    <section class="iu-drr-v2-panel" id="${escapeHtml(id)}">
      <div class="iu-drr-v2-panel-head">
        <div>
          <p class="iu-drr-v2-eyebrow">ALTEA · IU/DRR</p>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(helper)}</p>
        </div>
        ${badge(`${fmt.int(dateKeys.length)} дней`, 'info')}
      </div>
      <div class="iu-drr-v2-matrix-wrap">
        <table class="iu-drr-v2-matrix" style="--iu-drr-v2-days:${Math.max(1, dateKeys.length)}">
          <thead>
            <tr>
              <th class="iu-drr-v2-sticky iu-drr-v2-col-metric">Метрика</th>
              <th class="iu-drr-v2-sticky iu-drr-v2-col-formula">Расчет / источник</th>
              <th class="iu-drr-v2-sticky iu-drr-v2-col-summary">Итого</th>
              ${dateHeaders || '<th class="iu-drr-v2-date-col">—</th>'}
            </tr>
          </thead>
          <tbody>${body || `<tr><td colspan="${colSpan}">Нет данных по выбранному месяцу.</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;
}

function iuDrrDesignIuGroups(rows = []) {
  const wbPlan = (row) => numberOrZero(row.iuTargetRevenueWb || row.targetRevenueWb || row.contractTargetRevenueWb || row.managementTargetRevenueWb);
  const wbFact = (row) => numberOrZero(row.wbApiRevenue || row.iuRevenueWb || row.revenueWb || row.adsPctBaseWb || row.ordersRevenueWb);
  const wbAdsPlan = (row) => numberOrZero(row.iuPlanSpendWb || row.planSpendWb || row.contractMarketingPlanWb || row.managementPlanSpendWb);
  const wbAdsFact = (row) => numberOrZero(row.wbApiSpendFact || row.spendFactDrr || row.spendFact);
  const ozonPlan = (row) => numberOrZero(row.targetRevenueOzon);
  const ozonFact = (row) => numberOrZero(row.revenueOzon || row.ozonGmv);
  const ozonAdsPlan = (row) => numberOrZero(row.planSpendOzon);
  const ozonAdsFact = (row) => numberOrZero(row.spendFactOzon);
  const sum = (getter) => iuDrrDesignSum(rows, getter);
  const pctSummary = (factGetter, planGetter) => () => iuDrrDesignRatio(sum(factGetter), sum(planGetter));
  return [
    {
      key: 'wb',
      title: 'WB · ИУ и ДРР',
      subtitle: 'калиброванные API-факты, внешка отдельно от ДРР',
      rows,
      metrics: [
        { label: 'Целевой оборот WB', formula: 'ИУ / дневная норма', format: 'money', value: wbPlan, summary: () => sum(wbPlan) },
        { label: 'Фактический оборот WB', formula: 'WB API после сверки', format: 'money', value: wbFact, summary: () => sum(wbFact) },
        { label: 'Выполнение оборота WB', formula: 'факт / план', format: 'pct', kind: 'completion', value: (row) => iuDrrDesignRatio(wbFact(row), wbPlan(row)), summary: pctSummary(wbFact, wbPlan) },
        { label: 'Отклонение оборота WB', formula: 'факт - план', format: 'signedMoney', kind: 'revenueDelta', value: (row) => wbFact(row) - wbPlan(row), summary: () => sum(wbFact) - sum(wbPlan) },
        { label: 'План рекламы WB', formula: 'план ДРР × план/факт база', format: 'money', value: wbAdsPlan, summary: () => sum(wbAdsPlan) },
        { label: 'Факт рекламы WB', formula: 'WB Promotion без внешки', format: 'money', value: wbAdsFact, summary: () => sum(wbAdsFact) },
        { label: 'Выполнение рекламы WB', formula: 'факт / план', format: 'pct', kind: 'adsCompletion', value: (row) => iuDrrDesignRatio(wbAdsFact(row), wbAdsPlan(row)), summary: pctSummary(wbAdsFact, wbAdsPlan) },
        { label: 'План ДРР WB', formula: 'план %', format: 'pct', value: (row) => row.planPct, summary: () => iuDrrDesignRatio(sum(wbAdsPlan), sum(wbPlan)) },
        { label: 'Факт ДРР WB', formula: 'реклама / оборот', format: 'pct', kind: 'drr', plan: (row) => row.planPct, value: (row) => row.factPct != null ? row.factPct : iuDrrDesignRatio(wbAdsFact(row), wbFact(row)), summary: () => iuDrrDesignRatio(sum(wbAdsFact), sum(wbFact)) },
        { label: 'WB Продвижение', formula: 'внутренняя реклама', format: 'money', value: (row) => row.wbPromotion, summary: () => sum((row) => row.wbPromotion) },
        { label: 'WB Медиа', formula: 'канал рекламы', format: 'money', value: (row) => row.wbMedia, summary: () => sum((row) => row.wbMedia) },
        { label: 'WB Инфлюенс', formula: 'канал рекламы', format: 'money', value: (row) => row.wbInfluencer, summary: () => sum((row) => row.wbInfluencer) },
        { label: 'Реклама в ПВЗ', formula: 'канал рекламы', format: 'money', value: (row) => row.pvzAds, summary: () => sum((row) => row.pvzAds) },
        { label: 'Брендзона', formula: 'канал рекламы', format: 'money', value: (row) => row.brandZone, summary: () => sum((row) => row.brandZone) },
        { label: 'Обзоры', formula: 'канал рекламы', format: 'money', value: (row) => row.overviews, summary: () => sum((row) => row.overviews) },
        { label: 'Отзывы за баллы', formula: 'WB API / finance', format: 'money', value: (row) => row.reviewPoints, summary: () => sum((row) => row.reviewPoints) },
        { label: 'Внешний трафик', formula: 'отдельный контур, не ДРР', format: 'money', value: (row) => row.externalAds, summary: () => sum((row) => row.externalAds) },
        { label: 'Дельта расхода по ИУ', formula: 'факт рекламы - план', format: 'signedMoney', kind: 'adsDelta', value: (row) => wbAdsFact(row) - wbAdsPlan(row), summary: () => sum(wbAdsFact) - sum(wbAdsPlan) }
      ]
    },
    {
      key: 'ozon',
      title: 'Ozon · GMV, ИУ и исключения ДРР',
      subtitle: 'GMV и реклама по текущей расчетной логике без изменения формул',
      rows,
      metrics: [
        { label: 'План GMV / ИУ Ozon', formula: 'дневной план Ozon', format: 'money', value: ozonPlan, summary: () => sum(ozonPlan) },
        { label: 'Факт GMV Ozon', formula: 'продажи - возвраты', format: 'money', value: ozonFact, summary: () => sum(ozonFact) },
        { label: 'Выполнение GMV Ozon', formula: 'факт / план', format: 'pct', kind: 'completion', value: (row) => iuDrrDesignRatio(ozonFact(row), ozonPlan(row)), summary: pctSummary(ozonFact, ozonPlan) },
        { label: 'Отклонение GMV Ozon', formula: 'факт - план', format: 'signedMoney', kind: 'revenueDelta', value: (row) => ozonFact(row) - ozonPlan(row), summary: () => sum(ozonFact) - sum(ozonPlan) },
        { label: 'План рекламы Ozon', formula: 'GMV × цель ДРР', format: 'money', value: ozonAdsPlan, summary: () => sum(ozonAdsPlan) },
        { label: 'Факт рекламы Ozon', formula: 'Ozon Finance / расчет ДРР', format: 'money', value: ozonAdsFact, summary: () => sum(ozonAdsFact) },
        { label: 'Выполнение рекламы Ozon', formula: 'факт / план', format: 'pct', kind: 'adsCompletion', value: (row) => iuDrrDesignRatio(ozonAdsFact(row), ozonAdsPlan(row)), summary: pctSummary(ozonAdsFact, ozonAdsPlan) },
        { label: 'Цель ДРР Ozon', formula: 'договор / план', format: 'pct', value: (row) => row.planPctOzon, summary: () => iuDrrDesignRatio(sum(ozonAdsPlan), sum(ozonPlan)) },
        { label: 'Факт ДРР к GMV', formula: 'реклама / GMV', format: 'pct', kind: 'drr', plan: (row) => row.planPctOzon, value: (row) => row.factPctOzon != null ? row.factPctOzon : iuDrrDesignRatio(ozonAdsFact(row), ozonFact(row)), summary: () => iuDrrDesignRatio(sum(ozonAdsFact), sum(ozonFact)) },
        { label: 'Premium Plus исключено', formula: 'не входит в ДРР', format: 'money', value: (row) => row.ozonDrrExcludedPremiumPlus, summary: () => sum((row) => row.ozonDrrExcludedPremiumPlus) },
        { label: 'Бейдж Оригинал исключен', formula: 'не входит в ДРР', format: 'money', value: (row) => row.ozonDrrExcludedOriginalBadge, summary: () => sum((row) => row.ozonDrrExcludedOriginalBadge) },
        { label: 'Дельта расхода Ozon', formula: 'факт рекламы - план', format: 'signedMoney', kind: 'adsDelta', value: (row) => ozonAdsFact(row) - ozonAdsPlan(row), summary: () => sum(ozonAdsFact) - sum(ozonAdsPlan) }
      ]
    }
  ];
}

function iuDrrDesignOzonContext(model = {}) {
  const ozonPlan = model.payload?.ozonPlan || {};
  const ozonPlanMonth = model.ozonPlanMonth || ozonPlanMonthSummary(ozonPlan, model.selectedMonth);
  const ozonPlanTotals = ozonPlanMonth.totals || ozonPlan.totals || {};
  const ozonAllocation = ozonPlanMonth.allocation || ozonPlan.allocation || {};
  const ozonContractKpis = ozonPlan.contractKpis || {};
  const targetDrr = numberOrZero(model.monthSummary?.planPctOzon)
    || numberOrZero(ozonPlanTotals.targetDrr)
    || numberOrZero((ozonPlan.accounts || []).find((account) => account.key === 'smart')?.targetDrr)
    || 0.25;
  const monthTargetGmv = ozonPlanFactMonthTargetGmv(model, ozonPlanMonth);
  const context = iuDrrOzonPlanFactContext(model, {
    monthTargetGmv,
    smartShare: numberOrZero(ozonAllocation.smartShare || 0.4),
    targetDrr
  });
  return {
    ...context,
    ozonTargetDrr: targetDrr,
    ozonAdRevKpiRate: numberOrZero(ozonContractKpis.adRevKpiRate) || targetDrr
  };
}

function iuDrrDesignFunnelGroups(models = {}, rows = []) {
  const ozonContext = iuDrrDesignOzonContext(models.ozon);
  const wbFunnel = iuDrrFunnelBuildModel(models.wb, {});
  const ozonFunnel = iuDrrFunnelBuildModel(models.ozon, ozonContext);
  const yaAllowed = new Set(['ordersRevenue', 'factRevenue', 'orders', 'units', 'avgCheck', 'buyoutRate', 'views', 'clicks', 'ctr', 'toCart', 'cartRate', 'orderRate', 'cancellations', 'returns']);
  const yaMetrics = IU_DRR_FUNNEL_METRICS_YANDEX
    .filter((metric) => yaAllowed.has(metric.key))
    .map((metric) => ({ ...metric, sourceRequired: ['views', 'clicks', 'toCart', 'ctr', 'cartRate', 'orderRate'].includes(metric.key) }));
  return [
    {
      key: 'wb',
      title: 'WB · рекламная воронка',
      subtitle: 'ads API, заказы, клики, каналы и эффективность',
      rows: wbFunnel.rows,
      metrics: wbFunnel.metricRows,
      context: {}
    },
    {
      key: 'ozon',
      title: 'Ozon · рекламная воронка и GMV',
      subtitle: 'Ozon Smart, Finance и контрольные исключения',
      rows: ozonFunnel.rows,
      metrics: ozonFunnel.metricRows,
      context: ozonContext
    },
    {
      key: 'ya',
      title: 'Я.Маркет · только воронка',
      subtitle: 'без ИУ, плана и ДРР; верхняя воронка показывает источник явно',
      rows,
      metrics: yaMetrics,
      context: {}
    }
  ];
}

function iuDrrDesignHeroCards(rows = [], focus = 'all') {
  const sum = (getter) => iuDrrDesignSum(rows, getter);
  const wbPlan = sum((row) => numberOrZero(row.iuTargetRevenueWb || row.targetRevenueWb));
  const wbFact = sum((row) => numberOrZero(row.wbApiRevenue || row.iuRevenueWb || row.revenueWb || row.adsPctBaseWb || row.ordersRevenueWb));
  const wbAdsPlan = sum((row) => numberOrZero(row.iuPlanSpendWb || row.planSpendWb));
  const wbAdsFact = sum((row) => numberOrZero(row.wbApiSpendFact || row.spendFactDrr || row.spendFact));
  const ozonPlan = sum((row) => numberOrZero(row.targetRevenueOzon));
  const ozonFact = sum((row) => numberOrZero(row.revenueOzon || row.ozonGmv));
  const ozonAdsPlan = sum((row) => numberOrZero(row.planSpendOzon));
  const ozonAdsFact = sum((row) => numberOrZero(row.spendFactOzon));
  const yaOrders = sum((row) => numberOrZero(row.ordersRevenueYandex));
  const yaDelivered = sum((row) => numberOrZero(row.revenueYandex));
  const yaUnits = sum((row) => numberOrZero(row.deliveredUnitsYandex || row.unitsYandex));
  const yaSource = iuDrrDesignYandexHasSource(rows);
  const cards = [
    {
      key: 'wb',
      title: 'WB · ИУ',
      score: fmt.pct(iuDrrDesignRatio(wbFact, wbPlan)),
      detail: `${fmt.money(wbFact)} / ${fmt.money(wbPlan)}`,
      progress: iuDrrDesignRatio(wbFact, wbPlan),
      stats: [
        ['Реклама факт', fmt.money(wbAdsFact)],
        ['Реклама план', fmt.money(wbAdsPlan)],
        ['ДРР факт', iuDrrDesignRatio(wbAdsFact, wbFact) != null ? fmt.pct(iuDrrDesignRatio(wbAdsFact, wbFact)) : '—']
      ]
    },
    {
      key: 'ozon',
      title: 'Ozon · GMV',
      score: fmt.pct(iuDrrDesignRatio(ozonFact, ozonPlan)),
      detail: `${fmt.money(ozonFact)} / ${fmt.money(ozonPlan)}`,
      progress: iuDrrDesignRatio(ozonFact, ozonPlan),
      stats: [
        ['Реклама факт', fmt.money(ozonAdsFact)],
        ['Реклама план', fmt.money(ozonAdsPlan)],
        ['ДРР к GMV', iuDrrDesignRatio(ozonAdsFact, ozonFact) != null ? fmt.pct(iuDrrDesignRatio(ozonAdsFact, ozonFact)) : '—']
      ]
    },
    {
      key: 'ya',
      title: 'Я.Маркет · воронка',
      score: fmt.money(yaOrders),
      detail: `доставлено ${fmt.money(yaDelivered)} · ${fmt.int(yaUnits)} шт.`,
      progress: iuDrrDesignRatio(yaDelivered, yaOrders),
      stats: [
        ['Показы', yaSource ? fmt.int(sum((row) => row.yandexShows)) : 'нет источника'],
        ['Клики', yaSource ? fmt.int(sum((row) => row.yandexClicks)) : 'нет источника'],
        ['Выкуп', iuDrrDesignRatio(yaUnits, sum((row) => row.ordersUnitsYandex)) != null ? fmt.pct(iuDrrDesignRatio(yaUnits, sum((row) => row.ordersUnitsYandex))) : '—']
      ]
    }
  ];
  return `
    <div class="iu-drr-v2-hero">
      ${cards.map((card) => {
        const muted = focus !== 'all' && focus !== card.key ? ' is-muted' : '';
        const tone = card.key === 'ya' ? 'info' : iuDrrFunnelCompletionTone(card.progress);
        return `
          <article class="iu-drr-v2-card iu-drr-v2-card--${escapeHtml(card.key)} iu-drr-v2-tone-${escapeHtml(tone)}${muted}">
            <div class="iu-drr-v2-card-main">
              <span>${escapeHtml(card.title)}</span>
              <strong>${escapeHtml(card.score)}</strong>
              <em>${escapeHtml(card.detail)}</em>
            </div>
            <div class="iu-drr-v2-card-bar"><i style="width:${iuDrrDesignProgressStyle(card.progress)}"></i></div>
            <dl>
              ${card.stats.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}
            </dl>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function iuDrrDesignSourcesPanel(model = {}, rows = [], focus = 'all') {
  const payload = model.payload || {};
  const source = payload.source || {};
  const diagnostics = payload.diagnostics || {};
  const yandexSource = iuDrrDesignYandexHasSource(rows);
  const cards = [
    ['Сборка', payload.generatedAt || '—', `факт до ${payload.asOfDate || '—'}`],
    ['WB', source.adsSourceMode || diagnostics.adsSourceMode || 'WB API / сверка', diagnostics.wbApiCalibrationMode || 'калиброванный факт'],
    ['Ozon', payload.ozonFinance?.source?.sourceMode || 'Ozon Finance', payload.ozonFinance?.source?.endpoint || 'GMV = продажи - возвраты'],
    ['Я.Маркет', yandexSource ? 'воронка подключена' : 'нет источника верхней воронки', `${fmt.int(sumYandexRows(rows))} строк источника`]
  ];
  return `
    <section class="iu-drr-v2-panel">
      <div class="iu-drr-v2-panel-head">
        <div>
          <p class="iu-drr-v2-eyebrow">ALTEA · SOURCES</p>
          <h3>Источники и сверка</h3>
          <p>Отдельный экран для контроля источников, без изменения расчетов.</p>
        </div>
        ${badge(`фокус ${iuDrrDesignPlatformLabel(focus)}`, 'info')}
      </div>
      <div class="iu-drr-v2-source-grid">
        ${cards.map(([title, value, detail]) => `
          <div class="iu-drr-v2-source-card">
            <span>${escapeHtml(title)}</span>
            <strong>${escapeHtml(value)}</strong>
            <em>${escapeHtml(detail)}</em>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function sumYandexRows(rows = []) {
  return rows.reduce((sum, row) => sum + numberOrZero(row.yandexSourceRows), 0);
}

function renderIuDrr(rootId = 'view-iu-drr') {
  const root = document.getElementById(rootId);
  if (!root) return;
  if (!iuDrrSummaryHasPayload(state.iuDrrSummary || {}) && reloadIuDrrSummaryFromFile(rootId)) return;
  const baseModel = iuDrrDesignModelFor('wb', state.iuDrrSummary || {});
  const models = {
    wb: baseModel,
    ozon: iuDrrDesignModelFor('ozon', state.iuDrrSummary || {}),
    ya: iuDrrDesignModelFor('ya', state.iuDrrSummary || {})
  };
  const rows = iuDrrDesignRows(baseModel);
  const focus = iuDrrDesignMarketplaceFocus();
  const activeView = iuDrrDesignSubview();
  const tabs = [
    ['iu', 'ИУ по дням'],
    ['funnel', 'Воронка по дням'],
    ['sources', 'Источники']
  ];
  const monthSelect = `
    <select id="iuDrrDesignMonth" aria-label="Месяц ИУ/ДРР">
      ${baseModel.monthOptions.map((option) => `<option value="${escapeHtml(option.key)}" ${baseModel.selectedMonth === option.key ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
    </select>
  `;
  const tabHtml = tabs.map(([key, label]) => `
    <button type="button" class="iu-drr-v2-tab ${activeView === key ? 'active' : ''}" data-iu-drr-design-view="${escapeHtml(key)}" aria-pressed="${activeView === key ? 'true' : 'false'}">
      ${escapeHtml(label)}
    </button>
  `).join('');
  const content = activeView === 'funnel'
    ? iuDrrDesignMetricMatrix({
      id: 'iuDrrDesignFunnel',
      title: 'Воронка по дням · три площадки',
      helper: 'WB и Ozon остаются с рекламными метриками; Я.Маркет показывает только доступную воронку без ИУ и ДРР.',
      groups: iuDrrDesignFunnelGroups(models, rows),
      focus
    })
    : activeView === 'sources'
      ? iuDrrDesignSourcesPanel(baseModel, rows, focus)
      : iuDrrDesignMetricMatrix({
        id: 'iuDrrDesignDailyIu',
        title: 'ИУ по дням · все текущие метрики',
        helper: 'WB и Ozon в одной матрице. Я.Маркет здесь намеренно отсутствует: по контракту у него только воронка.',
        groups: iuDrrDesignIuGroups(rows),
        focus
      });
  root.innerHTML = `
    <section class="iu-drr-v2 iu-drr-v2-focus-${escapeHtml(focus)}">
      <div class="section-title iu-drr-v2-title">
        <div>
          <p class="iu-drr-v2-eyebrow">ALTEA · PERFORMANCE</p>
          <h2>ИУ / ДРР</h2>
          <p class="muted">Новый внешний слой без изменения расчетов: WB и Ozon для ИУ, Я.Маркет только для воронки.</p>
        </div>
        <div class="iu-drr-v2-title-badges">
          ${badge(`фокус ${iuDrrDesignPlatformLabel(focus)}`, 'info')}
          ${badge(`срез ${baseModel.payload?.asOfDate || baseModel.selectedMonth}`, 'ok')}
        </div>
      </div>
      <div class="iu-drr-v2-toolbar">
        ${monthSelect}
        <div class="iu-drr-v2-tabs" role="tablist" aria-label="Раздел ИУ/ДРР">${tabHtml}</div>
        <div class="iu-drr-v2-lock">Локальных фильтров площадки нет · используется общий селектор портала</div>
      </div>
      ${iuDrrDesignHeroCards(rows, focus)}
      ${content}
    </section>
  `;
  root.querySelector('#iuDrrDesignMonth')?.addEventListener('change', (event) => {
    getIuDrrFilters().month = String(event.target.value || 'latest');
    rerenderCurrentView();
  });
  root.querySelectorAll('[data-iu-drr-design-view]').forEach((button) => {
    button.addEventListener('click', () => {
      getIuDrrFilters().designSubview = String(button.getAttribute('data-iu-drr-design-view') || 'iu');
      rerenderCurrentView();
    });
  });
}

function renderProductLeaderboard(rootId = 'view-product-leaderboard') {
  if (rootId === 'view-ads-funnel') {
    renderAdsFunnel(rootId);
    return;
  }
  const root = document.getElementById(rootId);
  state.productLeaderboard = normalizeProductLeaderboardPayload(state.productLeaderboard || {});
  const payload = currentProductLeaderboardPayload();
  const freshness = productLeaderboardFreshnessMeta(payload);
  const filters = getProductLeaderboardFilters();
  const isSubstitutionMode = filters.expandedPanel === 'substitution';
  const isLikeForLikeMode = filters.expandedPanel === 'likeforlike';
  const isAlternateWorkbenchMode = isSubstitutionMode || isLikeForLikeMode;
  const filteredItems = getFilteredProductLeaderboardItems(payload);
  const filteredSummary = productLeaderboardSummaryFromItems(filteredItems);
  const ownerCoverage = filteredSummary.skuCount > 0 ? filteredSummary.ownerAssignedCount / filteredSummary.skuCount : 0;
  const snapshots = productLeaderboardHistoryPayloads();
  const gameHeroHtml = '';
  const moduleBoardHtml = '';
  const commonContourHtml = renderProductLeaderboardCommonContourHtml(payload, filteredSummary, filteredItems, filters, snapshots);
  const insightTilesHtml = renderProductLeaderboardInsightTilesHtml(payload, filteredSummary, ownerCoverage, filteredItems, filters);
  const metricsPanelHtml = !isSubstitutionMode && filters.expandedPanel === 'metrics'
    ? renderProductLeaderboardMetricsPanel(payload, filteredSummary, ownerCoverage)
    : '';
  const ownerRaceHtml = isAlternateWorkbenchMode ? '' : productLeaderboardOwnerRaceHtml(filteredItems);
  const substitutionRaceHtml = isSubstitutionMode
    ? renderProductLeaderboardSubstitutionRacePanel(filteredItems, payload, filters)
    : '';
  const likeForLikePanelHtml = isLikeForLikeMode
    ? renderProductLeaderboardLikeForLikePanel(payload, filteredItems)
    : '';
  const standardLeaderboardCardStyle = isAlternateWorkbenchMode ? 'display:none' : 'margin-top:14px';
  const snapshotSelectOptions = productLeaderboardSnapshotSelectOptions(snapshots);
  const historyOptions = snapshotSelectOptions.slice(1);
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
        <p>КЗ, digital, органика и реклама МП: доли, динамика и SKU-драйверы роста.</p>
      </div>
      <div class="badge-stack">
        ${badge(payload.weekLabel || 'недельный срез', 'info')}
        ${badge(`${fmt.int(filteredSummary.skuCount)} SKU`, filteredSummary.skuCount ? 'info' : 'warn')}
        ${badge(`${fmt.int(payload.totals.unmatchedRows || 0)} вне портала`, payload.totals.unmatchedRows ? 'warn' : 'ok')}
        ${badge(`${fmt.int(payload.alertCounts.critical || 0)} крит. откл.`, payload.alertCounts.critical ? 'danger' : 'ok')}
      </div>
    </div>

    ${commonContourHtml}

    ${gameHeroHtml}

    ${moduleBoardHtml}

    ${insightTilesHtml}

    ${metricsPanelHtml}

    <div class="kpi-strip" style="display:none">
      <div class="mini-kpi"><span>Охваты</span><strong>${fmt.int(filteredSummary.reach)}</strong><span>верх воронки</span></div>
      <div class="mini-kpi"><span>Клики</span><strong>${fmt.int(filteredSummary.clicks)}</strong><span>CTR ${fmt.pct(filteredSummary.ctrPct)}</span></div>
      <div class="mini-kpi"><span>Корзины</span><strong>${fmt.int(filteredSummary.carts)}</strong><span>из кликов ${fmt.pct(filteredSummary.cartRatePct)}</span></div>
      <div class="mini-kpi"><span>Заказы</span><strong>${fmt.int(filteredSummary.orders)}</strong><span>из кликов ${fmt.pct(filteredSummary.orderRatePct)}</span></div>
      <div class="mini-kpi"><span>Выкупы</span><strong>${fmt.int(filteredSummary.buys)}</strong><span>buyout ${fmt.pct(filteredSummary.buyoutPct)}</span></div>
      <div class="mini-kpi"><span>Выручка / доход</span><strong>${fmt.money(filteredSummary.revenue)}</strong><span>${fmt.money(filteredSummary.income)}</span></div>
    </div>

    <div class="card" style="display:none">
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

    ${ownerRaceHtml}

    ${substitutionRaceHtml}

    ${likeForLikePanelHtml}

    <div class="card" style="${standardLeaderboardCardStyle}">
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
          ${historyOptions.map((option) => `<option value="${escapeHtml(option.key)}" ${filters.snapshot === option.key ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
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
          <option value="gameScore" ${filters.sort === 'gameScore' ? 'selected' : ''}>Сортировка: КЗ показатель</option>
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

    <div class="card" style="${standardLeaderboardCardStyle}">
      <div class="section-subhead">
        <div>
          <h3>История логов</h3>
          <p class="small muted">Здесь остаются прошлые выгрузки и пересборки недели. Даже если источник не сменился, видно когда обновляли данные и как выглядел верх воронки.</p>
        </div>
        ${badge(`${fmt.int(snapshots.length)} логов`, snapshots.length ? 'info' : 'ok')}
      </div>
      <div class="list" style="margin-top:12px">${historyCards || '<div class="empty">История выгрузок пока не накопилась.</div>'}</div>
    </div>

    <div class="card" style="${standardLeaderboardCardStyle}">
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
              <th>КЗ модуль</th>
              <th>Owner</th>
              <th>Цена</th>
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
                <tr data-product-row="${escapeHtml(item.articleKey || item.id || item.article || item.name)}">
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
                  <td>${productLeaderboardRowGameHtml(item, payload)}</td>
                  <td>
                    <div>${item.owner ? badge(item.owner, 'info') : badge('Без owner', 'warn')}</div>
                    <div class="muted small" style="margin-top:8px">${item.article ? escapeHtml(item.article) : '—'}</div>
                  </td>
                  <td>${productLeaderboardPriceHtml(item)}</td>
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
            }).join('') || '<tr><td colspan="15"><div class="empty">По текущим фильтрам пока нет строк.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    ${payload.unmatchedItems.length ? `
      <div class="card" style="${standardLeaderboardCardStyle}">
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

    <details class="product-leaderboard-frog-egg" aria-label="Пасхалка продуктового лидерборда">
      <summary>
        <span>секретный люк</span>
        <b>не открывать после 18:00</b>
      </summary>
      <div class="product-leaderboard-frog-egg__stage">
        <img src="assets/product-leaderboard-frog.jpg" alt="Секретная жабка продуктового лидерборда" loading="lazy">
        <div>
          <strong>КЗ одобряет этот срез</strong>
          <em>пасхалка для тех, кто дошел до самого низа</em>
        </div>
      </div>
    </details>
  `;

  root.querySelector('#productLeaderboardSearch')?.addEventListener('input', (event) => {
    getProductLeaderboardFilters().search = event.target.value;
    rerenderCurrentView();
  });
  root.querySelectorAll('#productLeaderboardSnapshot, [data-product-leaderboard-snapshot]').forEach((select) => {
    select.addEventListener('change', (event) => {
      getProductLeaderboardFilters().snapshot = event.target.value;
      rerenderCurrentView();
    });
  });
  root.querySelectorAll('[data-product-week-snapshot]').forEach((button) => {
    button.addEventListener('click', () => {
      const snapshotKey = String(button.getAttribute('data-product-week-snapshot') || '').trim();
      if (!snapshotKey) return;
      getProductLeaderboardFilters().snapshot = snapshotKey;
      rerenderCurrentView();
    });
  });
  root.querySelector('[data-product-lfl-current]')?.addEventListener('change', (event) => {
    const filters = getProductLeaderboardFilters();
    filters.lflCurrentSnapshot = event.target.value;
    if (filters.lflCompareSnapshot === filters.lflCurrentSnapshot) {
      const lflModel = productLeaderboardExternalLikeForLikeModel(filters, filteredItems);
      const nextCompare = (lflModel.compareOptions || []).find((option) => option.key !== filters.lflCurrentSnapshot);
      filters.lflCompareSnapshot = nextCompare?.key || '';
    }
    rerenderCurrentView();
  });
  root.querySelector('[data-product-lfl-compare]')?.addEventListener('change', (event) => {
    const filters = getProductLeaderboardFilters();
    filters.lflCompareSnapshot = event.target.value;
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
  root.querySelectorAll('[data-product-leaderboard-panel]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextPanel = String(button.getAttribute('data-product-leaderboard-panel') || '').trim();
      if (!nextPanel) return;
      const productFilters = getProductLeaderboardFilters();
      productFilters.expandedPanel = nextPanel;
      rerenderCurrentView();
    });
  });
  root.querySelector('[data-product-leaderboard-export]')?.addEventListener('click', () => {
    downloadProductLeaderboardExcel(payload, filteredItems);
  });
}

const PRODUCT_LEADERBOARD_NATIVE_MIN_WEEKS = 8;
const PRODUCT_LEADERBOARD_NATIVE_MAX_WEEKS = 12;
const PRODUCT_LEADERBOARD_NATIVE_METRICS = {
  reach: { key: 'reach', label: 'Охват', format: 'int', hue: 42 },
  clicks: { key: 'clicks', label: 'Клики', format: 'int', hue: 205 },
  orders: { key: 'orders', label: 'Заказы', format: 'int', hue: 145 },
  buys: { key: 'buys', label: 'Выкупы', format: 'int', hue: 168 }
};

function productLeaderboardNativeFormatDelta(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  if (options.format === 'money') return productLeaderboardSignedMoney(value);
  if (options.format === 'pct') return productLeaderboardSignedPp(value);
  return productLeaderboardSignedInt(value);
}

function productLeaderboardNativePercentDelta(current, previous) {
  const prev = numberOrZero(previous);
  if (prev <= 0) return null;
  return (numberOrZero(current) - prev) / prev;
}

function productLeaderboardNativeWeekRows() {
  const byWeek = new Map();
  productLeaderboardHistoryPayloads().forEach((payload, index) => {
    const snapshot = normalizeProductLeaderboardPayload(payload || {});
    if (!Array.isArray(snapshot.items) || !snapshot.items.length) return;
    const summary = productLeaderboardSummaryFromItems(snapshot.items);
    if (summary.orders <= 0 && summary.reach <= 0) return;
    const range = productLeaderboardWeekRange(snapshot);
    const weekKey = range.fromIso && range.toIso
      ? `${range.fromIso}_${range.toIso}`
      : String(snapshot.weekLabel || snapshot.sourceSheetName || snapshot.generatedAt || `snapshot-${index}`).trim().toLowerCase();
    if (!weekKey) return;
    const startStamp = parseFreshStamp(range.fromIso || snapshot.sourceWeekFrom || snapshot.generatedAt || snapshot.weekLabel);
    const endStamp = parseFreshStamp(range.toIso || snapshot.sourceWeekTo || snapshot.generatedAt || snapshot.weekLabel);
    const sourceStamp = parseFreshStamp(snapshot.generatedAt || snapshot.sourceWeekTo || range.toIso || snapshot.weekLabel);
    const next = {
      weekKey,
      range,
      snapshot,
      summary,
      weekLabel: snapshot.weekLabel || snapshot.sourceSheetName || '',
      sourceStamp,
      startStamp,
      endStamp,
      rawIndex: index
    };
    const previous = byWeek.get(weekKey);
    if (!previous || sourceStamp >= previous.sourceStamp) byWeek.set(weekKey, next);
  });

  const rows = [...byWeek.values()].sort((left, right) => (
    numberOrZero(left.startStamp) - numberOrZero(right.startStamp)
    || numberOrZero(left.sourceStamp) - numberOrZero(right.sourceStamp)
    || String(left.weekLabel || '').localeCompare(String(right.weekLabel || ''), 'ru')
  ));
  rows.forEach((row, index) => {
    row.index = index;
    row.stableKey = `week:${row.weekKey}`;
    row.optionKey = index === rows.length - 1 ? 'latest' : row.stableKey;
  });
  return rows;
}

function productLeaderboardNativeWeekLabel(row = {}) {
  row = row || {};
  if (row.range?.fromLabel && row.range?.toLabel) return `${row.range.fromLabel} - ${row.range.toLabel}`;
  return row.weekLabel || 'недельный срез';
}

function productLeaderboardNativeSelectedWeeks(filters = {}) {
  const weeks = productLeaderboardNativeWeekRows();
  const selectedKey = String(filters.snapshot || 'latest').trim();
  let currentIndex = weeks.length - 1;
  if (selectedKey && selectedKey !== 'latest') {
    const matchedIndex = weeks.findIndex((row) => (
      row.stableKey === selectedKey
      || row.optionKey === selectedKey
      || row.snapshot.generatedAt === selectedKey
      || row.weekLabel === selectedKey
      || row.range?.fromIso === selectedKey
      || row.range?.toIso === selectedKey
    ));
    if (matchedIndex >= 0) currentIndex = matchedIndex;
  }
  const current = weeks[currentIndex] || null;
  const previous = currentIndex > 0 ? weeks[currentIndex - 1] : null;
  const gapDays = current && previous && current.startStamp && previous.startStamp
    ? Math.round((current.startStamp - previous.startStamp) / 86400000)
    : null;
  const hasAdjacentComparison = Boolean(previous && gapDays === 7);
  return {
    weeks,
    current,
    previous,
    currentIndex,
    gapDays,
    hasAdjacentComparison,
    hasEnoughHistory: weeks.length >= PRODUCT_LEADERBOARD_NATIVE_MIN_WEEKS
  };
}

function productLeaderboardNativeAggregateByKey(items = []) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item = {}) => {
    const key = productLeaderboardItemCompareKey(item);
    if (!key) return;
    const entry = map.get(key) || {
      key,
      item,
      reach: 0,
      reactions: 0,
      posts: 0,
      clicks: 0,
      carts: 0,
      orders: 0,
      buys: 0,
      contentCost: 0,
      revenue: 0,
      income: 0
    };
    entry.reach += numberOrZero(item.reach);
    entry.reactions += numberOrZero(item.reactions);
    entry.posts += numberOrZero(item.posts);
    entry.clicks += numberOrZero(item.clicks);
    entry.carts += numberOrZero(item.carts);
    entry.orders += numberOrZero(item.orders);
    entry.buys += numberOrZero(item.buys);
    entry.contentCost += numberOrZero(item.contentCost);
    entry.revenue += numberOrZero(item.revenue);
    entry.income += numberOrZero(item.income);
    if (!entry.item?.articleKey || item.articleKey) entry.item = item;
    map.set(key, entry);
  });
  return map;
}

function productLeaderboardNativeSummaryFromAggregates(rows = [], side = 'current') {
  const summary = {
    skuCount: 0,
    reach: 0,
    reactions: 0,
    posts: 0,
    clicks: 0,
    carts: 0,
    orders: 0,
    buys: 0,
    contentCost: 0,
    revenue: 0,
    income: 0
  };
  rows.forEach((row) => {
    const entry = side === 'previous' ? row.previous : row.current;
    if (!entry) return;
    summary.skuCount += 1;
    ['reach', 'reactions', 'posts', 'clicks', 'carts', 'orders', 'buys', 'contentCost', 'revenue', 'income'].forEach((key) => {
      summary[key] += numberOrZero(entry[key]);
    });
  });
  summary.ctrPct = summary.reach > 0 ? summary.clicks / summary.reach : 0;
  summary.cartRatePct = summary.clicks > 0 ? summary.carts / summary.clicks : 0;
  summary.orderRatePct = summary.clicks > 0 ? summary.orders / summary.clicks : 0;
  summary.buyoutPct = summary.orders > 0 ? summary.buys / summary.orders : 0;
  summary.romiPct = summary.contentCost > 0 ? summary.income / summary.contentCost : 0;
  summary.drrPct = summary.revenue > 0 ? summary.contentCost / summary.revenue : 0;
  return summary;
}

function productLeaderboardNativePrimaryCause(row = {}) {
  if (row.status === 'new') return 'новый SKU';
  if (row.status === 'discontinued') return 'выбыл из среза';
  const causes = [
    { label: 'трафик', value: Math.abs(numberOrZero(row.reachDelta)) },
    { label: 'клики / CTR', value: Math.abs(numberOrZero(row.clicksDelta)) },
    { label: 'корзина', value: Math.abs(numberOrZero(row.cartsDelta)) },
    { label: 'заказ', value: Math.abs(numberOrZero(row.ordersDelta)) },
    { label: 'выкуп', value: Math.abs(numberOrZero(row.buysDelta)) }
  ].sort((left, right) => right.value - left.value);
  return causes[0]?.value ? causes[0].label : 'без резкого фактора';
}

function productLeaderboardNativeComparisonRows(currentItems = [], previousItems = []) {
  const currentMap = productLeaderboardNativeAggregateByKey(currentItems);
  const previousMap = productLeaderboardNativeAggregateByKey(previousItems);
  const keys = new Set([...currentMap.keys(), ...previousMap.keys()]);
  return [...keys].map((key) => {
    const current = currentMap.get(key) || null;
    const previous = previousMap.get(key) || null;
    const item = current?.item || previous?.item || {};
    const row = {
      key,
      item,
      current,
      previous,
      currentItem: current?.item || null,
      previousItem: previous?.item || null,
      status: current && previous ? 'comparable' : current ? 'new' : 'discontinued',
      reachDelta: numberOrZero(current?.reach) - numberOrZero(previous?.reach),
      clicksDelta: numberOrZero(current?.clicks) - numberOrZero(previous?.clicks),
      cartsDelta: numberOrZero(current?.carts) - numberOrZero(previous?.carts),
      ordersDelta: numberOrZero(current?.orders) - numberOrZero(previous?.orders),
      buysDelta: numberOrZero(current?.buys) - numberOrZero(previous?.buys),
      revenueDelta: numberOrZero(current?.revenue) - numberOrZero(previous?.revenue)
    };
    row.ordersDeltaPct = productLeaderboardNativePercentDelta(current?.orders, previous?.orders);
    row.clicksDeltaPct = productLeaderboardNativePercentDelta(current?.clicks, previous?.clicks);
    row.primaryCause = productLeaderboardNativePrimaryCause(row);
    return row;
  });
}

function productLeaderboardNativeRowMatchesFilters(row = {}, filters = {}) {
  const search = String(filters.search || '').trim().toLowerCase();
  const item = row.currentItem || row.previousItem || row.item || {};
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
    item.traffic,
    item.creator,
    item.contentBatch,
    item.contentFormat,
    item.briefUrl,
    row.primaryCause
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(search);
}

function productLeaderboardNativeBridge(rows = []) {
  const comparable = rows.filter((row) => row.status === 'comparable')
    .reduce((sum, row) => sum + numberOrZero(row.ordersDelta), 0);
  const fresh = rows.filter((row) => row.status === 'new')
    .reduce((sum, row) => sum + numberOrZero(row.current?.orders), 0);
  const discontinued = rows.filter((row) => row.status === 'discontinued')
    .reduce((sum, row) => sum + numberOrZero(row.previous?.orders), 0);
  return {
    comparable,
    fresh,
    discontinued,
    total: comparable + fresh - discontinued
  };
}

function productLeaderboardNativeCauseBridge(current = {}, previous = {}) {
  const total = numberOrZero(current.orders) - numberOrZero(previous.orders);
  const previousCartRate = previous.clicks > 0 ? previous.carts / previous.clicks : 0;
  const currentCartRate = current.clicks > 0 ? current.carts / current.clicks : 0;
  const previousOrderRate = previous.carts > 0 ? previous.orders / previous.carts : 0;
  const currentOrderRate = current.carts > 0 ? current.orders / current.carts : 0;
  const traffic = (numberOrZero(current.clicks) - numberOrZero(previous.clicks)) * previousCartRate * previousOrderRate;
  const cart = numberOrZero(current.clicks) * (currentCartRate - previousCartRate) * previousOrderRate;
  const order = numberOrZero(current.carts) * (currentOrderRate - previousOrderRate);
  const residual = total - traffic - cart - order;
  return [
    { label: 'Трафик', value: traffic, detail: `${productLeaderboardNativeFormatDelta(numberOrZero(current.clicks) - numberOrZero(previous.clicks))} кликов` },
    { label: 'Переход в корзину', value: cart, detail: productLeaderboardSignedPp(currentCartRate - previousCartRate) },
    { label: 'Конверсия в заказ', value: order, detail: productLeaderboardSignedPp(currentOrderRate - previousOrderRate) },
    { label: 'Прочее / округление', value: residual, detail: 'сверка до итога' }
  ];
}

function productLeaderboardNativeSourceBuckets(items = [], metricKey = 'orders') {
  const wbArticleMap = productLeaderboardWbSubstitutionArticleMap();
  return (Array.isArray(items) ? items : []).reduce((acc, item) => {
    const bucket = productLeaderboardTrafficBucketForItem(item, wbArticleMap);
    const wbRow = metricKey === 'orders' && bucket === 'kz'
      ? productLeaderboardWbSubstitutionRowForItem(item, wbArticleMap)
      : null;
    acc[bucket] += productLeaderboardWbSubstitutionRowHasTraffic(wbRow)
      ? numberOrZero(wbRow.orders)
      : numberOrZero(item[metricKey]);
    return acc;
  }, { kz: 0, digital: 0, organic: 0 });
}

function productLeaderboardNativeBuildModel() {
  const filters = getProductLeaderboardFilters();
  const selection = productLeaderboardNativeSelectedWeeks(filters);
  if (!selection.current) {
    return {
      filters,
      selection,
      currentSummary: productLeaderboardSummaryFromItems([]),
      previousSummary: productLeaderboardSummaryFromItems([]),
      rows: [],
      visibleRows: [],
      bridge: null,
      hasComparison: false,
      warnings: ['Нет недельного среза для лидерборда.']
    };
  }
  const previousForCompare = selection.hasAdjacentComparison ? selection.previous : null;
  const allRows = productLeaderboardNativeComparisonRows(
    selection.current.snapshot.items || [],
    previousForCompare?.snapshot?.items || []
  );
  const visibleRows = allRows
    .filter((row) => productLeaderboardNativeRowMatchesFilters(row, filters))
    .sort((left, right) => (
      Math.abs(numberOrZero(right.ordersDelta)) - Math.abs(numberOrZero(left.ordersDelta))
      || Math.abs(numberOrZero(right.clicksDelta)) - Math.abs(numberOrZero(left.clicksDelta))
      || numberOrZero(right.current?.orders) - numberOrZero(left.current?.orders)
      || String(left.item?.name || '').localeCompare(String(right.item?.name || ''), 'ru')
    ));
  const currentSummary = productLeaderboardNativeSummaryFromAggregates(visibleRows, 'current');
  const previousSummary = productLeaderboardNativeSummaryFromAggregates(visibleRows, 'previous');
  const warnings = [];
  if (!selection.hasEnoughHistory) {
    warnings.push(`История неполная: ${selection.weeks.length} из ${PRODUCT_LEADERBOARD_NATIVE_MIN_WEEKS} нужных недель. Храним до ${PRODUCT_LEADERBOARD_NATIVE_MAX_WEEKS} неизменяемых срезов.`);
  }
  if (selection.previous && !selection.hasAdjacentComparison) {
    warnings.push(`Сравнение недоступно: рядом нет предыдущей календарной недели. Ближайший срез: ${productLeaderboardNativeWeekLabel(selection.previous)}.`);
  }
  if (!selection.previous) warnings.push('Сравнение недоступно: нет предыдущей полной недели.');
  return {
    filters,
    selection,
    rows: allRows,
    visibleRows,
    currentSummary,
    previousSummary,
    bridge: previousForCompare ? productLeaderboardNativeBridge(visibleRows) : null,
    causeBridge: previousForCompare ? productLeaderboardNativeCauseBridge(currentSummary, previousSummary) : [],
    hasComparison: Boolean(previousForCompare),
    warnings
  };
}

function productLeaderboardNativeKpiHtml(label, value, meta, delta, tone = 'info') {
  const deltaHtml = delta === null || delta === undefined
    ? '<span class="plb-native-kpi__delta is-muted">сравнение недоступно</span>'
    : `<span class="plb-native-kpi__delta is-${numberOrZero(delta) >= 0 ? 'ok' : 'danger'}">${escapeHtml(productLeaderboardNativeFormatDelta(delta))}</span>`;
  return `
    <article class="plb-native-kpi is-${escapeHtml(tone)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(meta)}</em>
      ${deltaHtml}
    </article>
  `;
}

function productLeaderboardNativeWeeklyChartHtml(model) {
  const metric = PRODUCT_LEADERBOARD_NATIVE_METRICS[model.filters.weeklyMetric] || PRODUCT_LEADERBOARD_NATIVE_METRICS.orders;
  const rows = model.selection.weeks.slice(-PRODUCT_LEADERBOARD_NATIVE_MAX_WEEKS);
  const maxValue = Math.max(1, ...rows.map((row) => numberOrZero(productLeaderboardSummaryFromItems(row.snapshot.items || [])[metric.key])));
  const metricButtons = Object.values(PRODUCT_LEADERBOARD_NATIVE_METRICS).map((item) => `
    <button type="button" class="quick-chip ${metric.key === item.key ? 'active' : ''}" data-product-weekly-metric="${escapeHtml(item.key)}">${escapeHtml(item.label)}</button>
  `).join('');
  return `
    <section class="card plb-native-chart">
      <div class="section-subhead">
        <div>
          <h3>Трафик по неделям</h3>
          <p class="small muted">Выделяем текущий срез и ближайшую предыдущую полную неделю. Стеки: КЗ, digital и без метки.</p>
        </div>
        <div class="quick-actions">${metricButtons}</div>
      </div>
      <div class="plb-native-chart__plot" style="--plb-columns:${rows.length || 1}">
        ${rows.map((row) => {
          const summary = productLeaderboardSummaryFromItems(row.snapshot.items || []);
          const total = numberOrZero(summary[metric.key]);
          const buckets = productLeaderboardNativeSourceBuckets(row.snapshot.items || [], metric.key);
          const scale = Math.max(12, Math.min(100, total / maxValue * 100));
          const denom = Math.max(1, total);
          const isCurrent = row.weekKey === model.selection.current?.weekKey;
          const isPrevious = model.hasComparison && row.weekKey === model.selection.previous?.weekKey;
          return `
            <button type="button" class="plb-native-column ${isCurrent ? 'is-current' : ''} ${isPrevious ? 'is-previous' : ''}" data-product-week-snapshot="${escapeHtml(row.stableKey)}" style="--plb-bar:${scale.toFixed(1)}%;--plb-hue:${metric.hue}">
              <span class="plb-native-column__value"><b>${fmt.int(total)}</b>${isCurrent ? '<em>текущая</em>' : isPrevious ? '<em>база</em>' : ''}</span>
              <i class="plb-native-column__bar">
                <b class="is-kz" style="height:${(numberOrZero(buckets.kz) / denom * 100).toFixed(1)}%"></b>
                <b class="is-digital" style="height:${(numberOrZero(buckets.digital) / denom * 100).toFixed(1)}%"></b>
                <b class="is-organic" style="height:${(numberOrZero(buckets.organic) / denom * 100).toFixed(1)}%"></b>
              </i>
              <small class="plb-native-column__label">${escapeHtml(productLeaderboardWeeklyChartLabel(row))}</small>
            </button>
          `;
        }).join('') || '<div class="empty">История недель пока не загружена.</div>'}
      </div>
    </section>
  `;
}

function productLeaderboardNativeBridgeHtml(model) {
  if (!model.hasComparison || !model.bridge) {
    return `
      <section class="card plb-native-bridge">
        <div class="section-subhead">
          <div>
            <h3>Изменение по сопоставимым SKU</h3>
            <p class="small muted">Сравнение будет доступно, когда появится предыдущая календарная неделя без разрыва.</p>
          </div>
          ${badge('Сравнение недоступно', 'warn')}
        </div>
      </section>
    `;
  }
  const items = [
    { label: 'Сопоставимые SKU', value: model.bridge.comparable, tone: model.bridge.comparable >= 0 ? 'ok' : 'danger' },
    { label: 'Новые SKU', value: model.bridge.fresh, tone: 'ok' },
    { label: 'Выбывшие SKU', value: -model.bridge.discontinued, tone: model.bridge.discontinued ? 'danger' : 'info' },
    { label: 'Общее изменение', value: model.bridge.total, tone: model.bridge.total >= 0 ? 'ok' : 'danger', total: true }
  ];
  return `
    <section class="card plb-native-bridge">
      <div class="section-subhead">
        <div>
          <h3>Изменение по сопоставимым SKU</h3>
          <p class="small muted">Общее изменение = сопоставимые SKU + новые SKU - выбывшие SKU.</p>
        </div>
        ${badge(`${productLeaderboardNativeWeekLabel(model.selection.current)} к ${productLeaderboardNativeWeekLabel(model.selection.previous)}`, 'info')}
      </div>
      <div class="plb-native-bridge__steps">
        ${items.map((item) => `
          <article class="is-${escapeHtml(item.tone)} ${item.total ? 'is-total' : ''}">
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(productLeaderboardNativeFormatDelta(item.value))}</strong>
          </article>
        `).join('')}
      </div>
      <div class="plb-native-causes">
        ${model.causeBridge.map((cause) => `
          <span class="${numberOrZero(cause.value) >= 0 ? 'is-ok' : 'is-danger'}">
            <b>${escapeHtml(cause.label)}</b>
            <strong>${escapeHtml(productLeaderboardNativeFormatDelta(cause.value))}</strong>
            <em>${escapeHtml(cause.detail)}</em>
          </span>
        `).join('')}
      </div>
    </section>
  `;
}

function productLeaderboardNativeFunnelHtml(model) {
  const current = model.currentSummary;
  const previous = model.previousSummary;
  const steps = [
    { key: 'posts', label: 'Публикации' },
    { key: 'reach', label: 'Охват' },
    { key: 'clicks', label: 'Клики' },
    { key: 'carts', label: 'Корзины' },
    { key: 'orders', label: 'Заказы' },
    { key: 'buys', label: 'Выкупы' }
  ];
  const maxValue = Math.max(1, ...steps.map((step) => numberOrZero(current[step.key])));
  return `
    <section class="card plb-native-funnel">
      <div class="section-subhead">
        <div>
          <h3>Воронка контента</h3>
          <p class="small muted">Публикации → охват → клики → корзины → заказы → выкупы.</p>
        </div>
        ${model.hasComparison ? badge('WoW', 'ok') : badge('без сравнения', 'warn')}
      </div>
      <div class="plb-native-funnel__steps">
        ${steps.map((step) => {
          const value = numberOrZero(current[step.key]);
          const previousValue = numberOrZero(previous[step.key]);
          const scale = Math.max(4, Math.min(100, value / maxValue * 100));
          return `
            <article>
              <span>${escapeHtml(step.label)}</span>
              <strong>${fmt.int(value)}</strong>
              <i><b style="width:${scale.toFixed(1)}%"></b></i>
              <em>${model.hasComparison ? productLeaderboardNativeFormatDelta(value - previousValue) : '—'}</em>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function productLeaderboardNativeBriefHtml(item = {}) {
  const url = String(item.briefUrl || '').trim();
  if (/^https?:\/\//i.test(url)) {
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">ТЗ</a>`;
  }
  return `<span class="muted small">${url ? escapeHtml(url) : 'нет ТЗ'}</span>`;
}

function productLeaderboardNativeContentCell(item = {}) {
  const fields = [
    item.creator ? `creator: ${item.creator}` : 'creator не задан',
    item.contentBatch ? `партия: ${item.contentBatch}` : 'партия не задана',
    item.contentFormat ? `формат: ${item.contentFormat}` : 'формат не задан',
    item.publishedAt ? `публикация: ${item.publishedAt}` : 'дата не задана'
  ];
  return `
    <div class="plb-native-content-cell">
      ${fields.map((field) => `<span>${escapeHtml(field)}</span>`).join('')}
      ${productLeaderboardNativeBriefHtml(item)}
    </div>
  `;
}

function productLeaderboardNativeRowsTableHtml(model, options = {}) {
  const rows = model.visibleRows.slice(0, options.limit || 12);
  const showContent = options.showContent !== false;
  return `
    <section class="card plb-native-table-card">
      <div class="section-subhead">
        <div>
          <h3>${escapeHtml(options.title || 'SKU-драйверы')}</h3>
          <p class="small muted">${escapeHtml(options.caption || 'Сортировка по абсолютному вкладу SKU в изменение заказов.')}</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(model.visibleRows.length)} SKU`, model.visibleRows.length ? 'info' : 'warn')}
          ${model.hasComparison ? badge('сравнение честное', 'ok') : badge('без WoW', 'warn')}
        </div>
      </div>
      <div class="table-wrap plb-native-table-wrap" style="margin-top:12px">
        <table class="plb-native-table">
          <thead>
            <tr>
              <th>SKU / товар</th>
              <th>Статус</th>
              <th>Owner</th>
              ${showContent ? '<th>Контент</th>' : ''}
              <th>Охват</th>
              <th>CTR</th>
              <th>Корзины</th>
              <th>Заказы</th>
              <th>Выкупы</th>
              <th>ROMI / ДРР</th>
              <th>Фактор</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => {
              const item = row.currentItem || row.previousItem || row.item || {};
              const current = row.current || {};
              const previous = row.previous || {};
              const statusLabel = row.status === 'new' ? 'новый' : row.status === 'discontinued' ? 'выбыл' : 'сопоставимый';
              const statusTone = row.status === 'new' ? 'ok' : row.status === 'discontinued' ? 'danger' : 'info';
              const ctr = productLeaderboardSafeRatio(current.clicks, current.reach);
              const previousCtr = productLeaderboardSafeRatio(previous.clicks, previous.reach);
              return `
                <tr data-product-native-sku="${escapeHtml(row.key)}" class="is-${escapeHtml(row.status)}">
                  <td>
                    <strong>${item.articleKey ? linkToSku(item.articleKey, item.articleKey) : escapeHtml(item.article || item.name || row.key)}</strong>
                    <div class="muted small">${escapeHtml(item.name || '')}</div>
                    <div class="badge-stack" style="margin-top:7px">
                      ${item.traffic ? badge(item.traffic, 'info') : badge('без метки', '')}
                      ${item.category ? badge(item.category, '') : ''}
                    </div>
                  </td>
                  <td>${badge(statusLabel, statusTone)}</td>
                  <td>${item.owner ? badge(item.owner, 'info') : badge('owner не задан', 'warn')}</td>
                  ${showContent ? `<td>${productLeaderboardNativeContentCell(item)}</td>` : ''}
                  <td><strong>${fmt.int(current.reach || 0)}</strong><div class="muted small">${model.hasComparison ? productLeaderboardNativeFormatDelta(row.reachDelta) : '—'}</div></td>
                  <td>${fmt.pct(ctr)}<div class="muted small">${model.hasComparison && previousCtr !== null && ctr !== null ? productLeaderboardSignedPp(ctr - previousCtr) : '—'}</div></td>
                  <td>${fmt.int(current.carts || 0)}<div class="muted small">${model.hasComparison ? productLeaderboardNativeFormatDelta(row.cartsDelta) : '—'}</div></td>
                  <td><strong>${fmt.int(current.orders || 0)}</strong><div class="${numberOrZero(row.ordersDelta) >= 0 ? 'ok-text' : 'danger-text'} small">${model.hasComparison ? productLeaderboardNativeFormatDelta(row.ordersDelta) : '—'}</div></td>
                  <td>${fmt.int(current.buys || 0)}<div class="muted small">${model.hasComparison ? productLeaderboardNativeFormatDelta(row.buysDelta) : '—'}</div></td>
                  <td>${fmt.pct(item.romiPct)}<div class="muted small">ДРР ${fmt.pct(item.drrPct)}</div></td>
                  <td>${badge(row.primaryCause, row.ordersDelta >= 0 ? 'ok' : 'warn')}</td>
                </tr>
              `;
            }).join('') || '<tr><td colspan="11"><div class="empty">По текущим фильтрам нет строк.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function productLeaderboardNativeDrawerHtml(model) {
  const key = String(model.filters.selectedSkuKey || '').trim();
  if (!key) return '';
  const row = model.visibleRows.find((item) => item.key === key) || model.rows.find((item) => item.key === key);
  if (!row) return '';
  const item = row.currentItem || row.previousItem || row.item || {};
  return `
    <aside class="plb-native-drawer">
      <button type="button" class="quick-chip" data-product-native-close>Закрыть</button>
      <div>
        <span>Деталь SKU</span>
        <h3>${escapeHtml(item.name || item.articleKey || row.key)}</h3>
        <p class="small muted">${escapeHtml(item.articleKey || item.article || '')}</p>
      </div>
      <div class="plb-native-drawer__grid">
        <span><b>${fmt.int(row.current?.orders || 0)}</b><em>заказы сейчас</em></span>
        <span><b>${model.hasComparison ? productLeaderboardNativeFormatDelta(row.ordersDelta) : '—'}</b><em>изменение</em></span>
        <span><b>${fmt.int(row.current?.clicks || 0)}</b><em>клики</em></span>
        <span><b>${fmt.money(row.current?.revenue || 0)}</b><em>выручка</em></span>
      </div>
      <div class="plb-native-content-cell">${productLeaderboardNativeContentCell(item)}</div>
      <p class="small muted">Основной фактор: ${escapeHtml(row.primaryCause)}.</p>
    </aside>
  `;
}

function productLeaderboardNativeFiltersHtml(model) {
  const payload = model.selection.current?.snapshot || normalizeProductLeaderboardPayload(state.productLeaderboard || {});
  const weekOptions = model.selection.weeks.map((row) => `
    <option value="${escapeHtml(row.optionKey)}" ${row.weekKey === model.selection.current?.weekKey ? 'selected' : ''}>${escapeHtml(productLeaderboardNativeWeekLabel(row))}</option>
  `).join('');
  return `
    <div class="plb-native-toolbar">
      <input id="productLeaderboardSearch" placeholder="SKU, товар, owner, creator, ТЗ..." value="${escapeHtml(model.filters.search || '')}">
      <select id="productLeaderboardSnapshot">
        ${weekOptions || '<option value="latest">Текущий срез</option>'}
      </select>
      <select id="productLeaderboardOwner">
        <option value="all" ${model.filters.owner === 'all' ? 'selected' : ''}>Все owner</option>
        ${(payload.owners || []).map((owner) => `<option value="${escapeHtml(owner)}" ${model.filters.owner === owner ? 'selected' : ''}>${escapeHtml(owner)}</option>`).join('')}
      </select>
      <select id="productLeaderboardCategory">
        <option value="all" ${model.filters.category === 'all' ? 'selected' : ''}>Все категории</option>
        ${(payload.categories || []).map((category) => `<option value="${escapeHtml(category)}" ${model.filters.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}
      </select>
      <button class="quick-chip portal-action-primary" type="button" data-product-leaderboard-export>Excel</button>
    </div>
  `;
}

function productLeaderboardNativeSubviewHtml(model) {
  if (model.filters.subview === 'sku-funnel') {
    return `
      ${productLeaderboardNativeFunnelHtml(model)}
      ${productLeaderboardNativeRowsTableHtml(model, {
        title: 'Полная таблица SKU и воронки',
        caption: 'Охват, CTR, корзины, заказы, выкупы и вклад в изменение.',
        limit: 80,
        showContent: true
      })}
    `;
  }
  if (model.filters.subview === 'content-causes') {
    return `
      ${productLeaderboardNativeBridgeHtml(model)}
      ${productLeaderboardNativeRowsTableHtml(model, {
        title: 'Контент и причины',
        caption: 'Creator, партия, формат, дата публикации и ссылка на ТЗ. Пустые поля показывают, что источник их ещё не отдаёт.',
        limit: 80,
        showContent: true
      })}
    `;
  }
  return `
    <div class="plb-native-layout">
      ${productLeaderboardNativeWeeklyChartHtml(model)}
      ${productLeaderboardNativeBridgeHtml(model)}
    </div>
    ${productLeaderboardNativeFunnelHtml(model)}
    ${productLeaderboardNativeRowsTableHtml(model, {
      title: 'Главные SKU-драйверы',
      caption: 'Вверху SKU с самым большим вкладом в изменение заказов или трафика.',
      limit: 12,
      showContent: true
    })}
  `;
}

function renderProductLeaderboard(rootId = 'view-product-leaderboard') {
  if (rootId === 'view-ads-funnel') {
    renderAdsFunnel(rootId);
    return;
  }
  const root = document.getElementById(rootId);
  if (!root) return;
  state.productLeaderboard = normalizeProductLeaderboardPayload(state.productLeaderboard || {});
  const model = productLeaderboardNativeBuildModel();
  const current = model.currentSummary;
  const previous = model.previousSummary;
  const tabs = [
    ['overview', 'Обзор WoW'],
    ['sku-funnel', 'Воронка SKU'],
    ['content-causes', 'Контент и причины']
  ].map(([key, label]) => `
    <button type="button" class="quick-chip ${model.filters.subview === key ? 'active' : ''}" data-product-leaderboard-native-tab="${key}">${label}</button>
  `).join('');
  const warningHtml = model.warnings.length
    ? `<div class="plb-native-warning">${model.warnings.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>`
    : '';

  root.dataset.productLeaderboardVersion = 'native-wow-v1';
  root.innerHTML = `
    <div class="plb-native">
      <div class="section-title">
        <div>
          <span class="section-kicker">Контент-завод · неделя к неделе</span>
          <h2>Что изменилось — и почему</h2>
          <p>Трафик → воронка → заказы → вклад SKU. Первый экран показывает причины изменения и рабочие сигналы.</p>
        </div>
        <div class="badge-stack">
          ${badge(productLeaderboardNativeWeekLabel(model.selection.current), 'info')}
          ${model.hasComparison ? badge(`к ${productLeaderboardNativeWeekLabel(model.selection.previous)}`, 'ok') : badge('Сравнение недоступно', 'warn')}
          ${badge(`${fmt.int(model.selection.weeks.length)} недель истории`, model.selection.weeks.length >= PRODUCT_LEADERBOARD_NATIVE_MIN_WEEKS ? 'ok' : 'warn')}
        </div>
      </div>

      ${productLeaderboardNativeFiltersHtml(model)}

      <div class="quick-actions plb-native-tabs">${tabs}</div>
      ${warningHtml}

      <div class="plb-native-kpis">
        ${productLeaderboardNativeKpiHtml('Охват', fmt.int(current.reach), `${fmt.int(current.posts)} публикаций`, model.hasComparison ? current.reach - previous.reach : null, 'reach')}
        ${productLeaderboardNativeKpiHtml('Клики · CTR', fmt.int(current.clicks), `CTR ${fmt.pct(current.ctrPct)}`, model.hasComparison ? current.clicks - previous.clicks : null, 'clicks')}
        ${productLeaderboardNativeKpiHtml('Заказы', fmt.int(current.orders), `CR ${fmt.pct(current.orderRatePct)}`, model.hasComparison ? current.orders - previous.orders : null, 'orders')}
        ${productLeaderboardNativeKpiHtml('Выкупы · выручка', `${fmt.int(current.buys)} / ${fmt.money(current.revenue)}`, `buyout ${fmt.pct(current.buyoutPct)}`, model.hasComparison ? current.buys - previous.buys : null, 'revenue')}
      </div>

      ${productLeaderboardNativeSubviewHtml(model)}
      ${productLeaderboardNativeDrawerHtml(model)}
    </div>
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
  root.querySelectorAll('[data-product-leaderboard-native-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      getProductLeaderboardFilters().subview = button.getAttribute('data-product-leaderboard-native-tab') || 'overview';
      rerenderCurrentView();
    });
  });
  root.querySelectorAll('[data-product-weekly-metric]').forEach((button) => {
    button.addEventListener('click', () => {
      getProductLeaderboardFilters().weeklyMetric = button.getAttribute('data-product-weekly-metric') || 'orders';
      rerenderCurrentView();
    });
  });
  root.querySelectorAll('[data-product-week-snapshot]').forEach((button) => {
    button.addEventListener('click', () => {
      getProductLeaderboardFilters().snapshot = button.getAttribute('data-product-week-snapshot') || 'latest';
      rerenderCurrentView();
    });
  });
  root.querySelectorAll('[data-product-native-sku]').forEach((row) => {
    row.addEventListener('click', () => {
      getProductLeaderboardFilters().selectedSkuKey = row.getAttribute('data-product-native-sku') || '';
      rerenderCurrentView();
    });
  });
  root.querySelector('[data-product-native-close]')?.addEventListener('click', () => {
    getProductLeaderboardFilters().selectedSkuKey = '';
    rerenderCurrentView();
  });
  root.querySelector('[data-product-leaderboard-export]')?.addEventListener('click', () => {
    const payload = model.selection.current?.snapshot || normalizeProductLeaderboardPayload(state.productLeaderboard || {});
    const items = model.visibleRows.map((row) => row.currentItem || row.previousItem || row.item).filter(Boolean);
    downloadProductLeaderboardExcel(payload, items);
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
        ${hasGantt ? badge('Календарь есть', 'ok') : badge('Нет календаря', 'warn')}
      </div>
      <div class="muted small launch-source-line" style="margin-top:8px">${escapeHtml(sourceMeta || 'Источник: портал')}</div>
      <div class="muted small" style="margin-top:8px">${escapeHtml(item.status || 'Статус не указан')}</div>
      <div class="muted small launch-card-metrics" style="margin-top:8px">План выручки ${fmt.money(item.plannedRevenue)} · Целевая себестоимость ${fmt.money(item.targetCost)} · Активных задач ${fmt.int(item.activeTasks || 0)}</div>
      ${!item.articleMatched && item.skuSuggestions?.length ? `<div class="muted small" style="margin-top:8px">Подсказка по SKU: ${escapeHtml(item.skuSuggestions.map((entry) => entry.articleKey).join(', '))}</div>` : ''}
      <div class="muted small" style="margin-top:8px">${escapeHtml(item.characteristic || 'Описание по новинке пока не заполнено')}</div>
      ${item.notes ? `<div class="muted small" style="margin-top:8px">${escapeHtml(item.notes)}</div>` : ''}
      <div class="muted small" style="margin-top:8px">Календарь: ${escapeHtml(ganttPreview || 'месяцы в плане пока не отмечены')}</div>
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

function launchTaskCountMap() {
  const map = new Map();
  getAllTasks().forEach((task) => {
    if (!isTaskActive(task) || task.type !== 'launch') return;
    const keys = [
      String(task.articleKey || '').trim(),
      String(task.entityLabel || '').trim().toLowerCase()
    ].filter(Boolean);
    keys.forEach((key) => map.set(key, (map.get(key) || 0) + 1));
  });
  return map;
}

function launchWithTaskCount(item, countMap) {
  const nameKey = String(item?.name || '').trim().toLowerCase();
  const articleCount = item?.articleKey ? numberOrZero(countMap.get(item.articleKey)) : 0;
  const nameCount = nameKey ? numberOrZero(countMap.get(nameKey)) : 0;
  return { ...item, activeTasks: Math.max(numberOrZero(item?.activeTasks), articleCount, nameCount) };
}

function launchStatusOptionsHtml(currentStatus = '') {
  const current = String(currentStatus || '').trim();
  const options = [
    'Черновик',
    'Бриф заполнить',
    'В производстве',
    'Карточка / контент',
    'Цена / экономика',
    'Готово к запуску',
    'В продаже / масштабировать',
    'Пауза / не запускаем'
  ];
  const custom = current && !options.includes(current)
    ? `<option value="${escapeHtml(current)}" selected>${escapeHtml(current)}</option>`
    : '';
  return `${custom}${options.map((option) => `<option value="${escapeHtml(option)}" ${current === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}`;
}

function launchStatusTheme(value = '') {
  const raw = String(value || '').trim();
  const text = raw.toLowerCase().replace(/ё/g, 'е');
  const themes = {
    draft: { key: 'draft', label: 'черновик', color: '#9aa3af' },
    brief: { key: 'brief', label: 'бриф', color: '#edce8a' },
    supply: { key: 'supply', label: 'производство', color: '#56a7f2' },
    content: { key: 'content', label: 'контент', color: '#62d5d1' },
    economy: { key: 'economy', label: 'экономика', color: '#f5a96f' },
    waiting: { key: 'waiting', label: 'ожидание', color: '#ffd166' },
    sample: { key: 'sample', label: 'образец', color: '#8bd46e' },
    ready: { key: 'ready', label: 'готово', color: '#5dcb94' },
    live: { key: 'live', label: 'в продаже', color: '#6ec6a2' },
    paused: { key: 'paused', label: 'пауза', color: '#ff6c6c' },
    other: { key: 'other', label: raw || 'статус', color: '#edce8a' }
  };
  if (!text) return themes.draft;
  if (/пауза|не запуска|стоп|отмен|блок|заморож|архив/.test(text)) return themes.paused;
  if (/в продаже|масштаб|live|продаж/.test(text)) return themes.live;
  if (/готов|согласован,\s*отдали|запуск разреш|можно запуск/.test(text)) return themes.ready;
  if (/цен|эконом|себес|себест|счет|счёт|кп|оплат|марж/.test(text)) return themes.economy;
  if (/производ|постав|завод|сырье|сырье|состав|коррект|флакон/.test(text)) return themes.supply;
  if (/карточ|контент|тз|дизайн|маркет|презент|бренд/.test(text)) return themes.content;
  if (/образец|тест|отдуш|пробник/.test(text)) return themes.sample;
  if (/ждем|ждём|ожида|соглас|договор|брокер|серге|подпис|услов/.test(text)) return themes.waiting;
  if (/бриф|заполнить|заполнен/.test(text)) return themes.brief;
  if (/чернов|не нач|нужен owner|статус не указан/.test(text)) return themes.draft;
  return themes.other;
}

function launchStatusInlineStyle(value = '') {
  const theme = launchStatusTheme(value);
  return `--promo-color:${theme.color};--launch-status-color:${theme.color}`;
}

function launchNegotiationStatusOptionsHtml(currentStatus = '') {
  const current = String(currentStatus || '').trim();
  const options = [
    'Не начинали',
    'Запрошены условия',
    'Ждем КП',
    'Ждем образец',
    'Образец получен',
    'Согласуем цену',
    'Контракт / заказ',
    'Пауза'
  ];
  const custom = current && !options.includes(current)
    ? `<option value="${escapeHtml(current)}" selected>${escapeHtml(current)}</option>`
    : '';
  return `${custom}${options.map((option) => `<option value="${escapeHtml(option)}" ${current === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}`;
}

function launchSupplyLabel(item = {}) {
  const parts = [
    item.supplierName ? `Поставщик: ${item.supplierName}` : '',
    item.factoryName ? `Завод: ${item.factoryName}` : '',
    item.production ? `Условия: ${item.production}` : '',
    item.negotiationStatus || ''
  ].filter(Boolean);
  return parts.join(' · ');
}

function launchTaskStatusOptionsHtml(currentStatus = '') {
  const current = String(currentStatus || '').trim();
  const options = ['Не начато', 'В работе', 'Ждем ответ', 'Блокер', 'Готово'];
  const custom = current && !options.includes(current)
    ? `<option value="${escapeHtml(current)}" selected>${escapeHtml(current)}</option>`
    : '';
  return `${custom}${options.map((option) => `<option value="${escapeHtml(option)}" ${current === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}`;
}

const LAUNCH_PRODUCT_TEMPLATES = [
  {
    key: 'cosmetics',
    label: 'Косметика',
    type: 'Косметика',
    stages: {
      negotiation: { dueBeforeLaunch: 45, fallbackDays: 3, comment: 'Цена, MOQ, сроки, документы, образец.' },
      sample: { dueBeforeLaunch: 35, fallbackDays: 10, comment: 'Получить и проверить образец.' },
      production: { dueBeforeLaunch: 24, fallbackDays: 18, comment: 'Зафиксировать партию, срок и ограничения производства.' },
      packaging: { dueBeforeLaunch: 18, fallbackDays: 22, comment: 'Этикетка, макеты, сертификаты, маркировка.' },
      content: { dueBeforeLaunch: 12, fallbackDays: 26, comment: 'Фото, описание, SKU, карточки площадок.' },
      launchReadiness: { dueBeforeLaunch: 3, fallbackDays: 30, comment: 'Проверить остаток, карточки, цену, дату запуска.' }
    }
  },
  {
    key: 'supplement',
    label: 'БАД / нутра',
    type: 'БАД / нутра',
    stages: {
      negotiation: { dueBeforeLaunch: 60, fallbackDays: 5, comment: 'Состав, документы, MOQ, цена, контракт.' },
      sample: { dueBeforeLaunch: 48, fallbackDays: 14, comment: 'Образец, вкус/форма, тест, правки.' },
      production: { dueBeforeLaunch: 34, fallbackDays: 28, comment: 'Партия, сырье, сроки, декларации.' },
      packaging: { dueBeforeLaunch: 24, fallbackDays: 36, comment: 'Этикетка, инструкция, документы, маркировка.' },
      content: { dueBeforeLaunch: 16, fallbackDays: 42, comment: 'Карточка, фото, описание без рискованных обещаний.' },
      launchReadiness: { dueBeforeLaunch: 5, fallbackDays: 50, comment: 'Финальная проверка площадок, цены и наличия.' }
    }
  },
  {
    key: 'accessory',
    label: 'Аксессуар',
    type: 'Аксессуар',
    stages: {
      negotiation: { dueBeforeLaunch: 32, fallbackDays: 2, comment: 'Цена, MOQ, цвет/размер, срок поставки.' },
      sample: { dueBeforeLaunch: 24, fallbackDays: 7, comment: 'Проверить качество и комплектацию.' },
      production: { dueBeforeLaunch: 16, fallbackDays: 14, comment: 'Подтвердить партию и упаковку.' },
      packaging: { dueBeforeLaunch: 12, fallbackDays: 18, comment: 'Упаковка, штрихкод, маркировка.' },
      content: { dueBeforeLaunch: 8, fallbackDays: 21, comment: 'Фото, размеры, карточка, преимущества.' },
      launchReadiness: { dueBeforeLaunch: 2, fallbackDays: 28, comment: 'Финальная проверка цены, карточки и остатков.' }
    }
  },
  {
    key: 'marketplace',
    label: 'Маркетплейс SKU',
    type: 'Маркетплейс SKU',
    stages: {
      negotiation: { dueBeforeLaunch: 21, fallbackDays: 2, comment: 'Условия поставки, документы, цена.' },
      sample: { dueBeforeLaunch: 17, fallbackDays: 5, comment: 'Проверить образец или фото/спецификацию.' },
      production: { dueBeforeLaunch: 12, fallbackDays: 9, comment: 'Готовность партии и отгрузки.' },
      packaging: { dueBeforeLaunch: 9, fallbackDays: 12, comment: 'Упаковка, штрихкод, требования площадок.' },
      content: { dueBeforeLaunch: 6, fallbackDays: 15, comment: 'Карточка, SEO, фото, цена.' },
      launchReadiness: { dueBeforeLaunch: 1, fallbackDays: 21, comment: 'Проверить публикацию и дату запуска.' }
    }
  },
  {
    key: 'relaunch',
    label: 'Перезапуск',
    type: 'Перезапуск',
    stages: {
      negotiation: { dueBeforeLaunch: 24, fallbackDays: 2, comment: 'Что меняем: цена, упаковка, поставщик, условия.' },
      sample: { dueBeforeLaunch: 18, fallbackDays: 5, comment: 'Проверить новую версию.' },
      production: { dueBeforeLaunch: 12, fallbackDays: 10, comment: 'Подтвердить партию и срок перехода.' },
      packaging: { dueBeforeLaunch: 9, fallbackDays: 12, comment: 'Обновить упаковку, документы, карточку.' },
      content: { dueBeforeLaunch: 6, fallbackDays: 14, comment: 'Обновить карточки, фото, УТП.' },
      launchReadiness: { dueBeforeLaunch: 1, fallbackDays: 18, comment: 'Проверить замену старой версии и старт продаж.' }
    }
  }
];

function launchProductTypeOptionsHtml(currentType = '') {
  const current = String(currentType || '').trim();
  const options = LAUNCH_PRODUCT_TEMPLATES.map((template) => template.type);
  const custom = current && !options.includes(current)
    ? `<option value="${escapeHtml(current)}" selected>${escapeHtml(current)}</option>`
    : '';
  return `${custom}<option value="" ${current ? '' : 'selected'}>Не выбран</option>${options.map((option) => `<option value="${escapeHtml(option)}" ${current === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}`;
}

function launchDecisionOptionsHtml(currentDecision = '') {
  const current = String(currentDecision || '').trim();
  const options = ['Нет решения', 'Запускаем', 'Запускаем после правок', 'На паузе', 'Не запускаем'];
  const custom = current && !options.includes(current)
    ? `<option value="${escapeHtml(current)}" selected>${escapeHtml(current)}</option>`
    : '';
  return `${custom}${options.map((option) => `<option value="${escapeHtml(option)}" ${current === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}`;
}

function launchDateOffset(dateKey = '', offsetDays = 0) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) {
    const date = new Date(`${dateKey}T12:00:00`);
    date.setDate(date.getDate() + offsetDays);
    return date.toISOString().slice(0, 10);
  }
  return plusDays(offsetDays);
}

function launchStageTemplateKey(statusField = '') {
  return String(statusField || '').replace(/Status$/, '');
}

function applyLaunchTemplateToForm(form, templateKey = '') {
  const template = LAUNCH_PRODUCT_TEMPLATES.find((entry) => entry.key === templateKey);
  if (!form || !template) return false;
  const setValue = (name, value, options = {}) => {
    const field = form.elements.namedItem(name);
    if (!field) return;
    if (options.onlyEmpty && String(field.value || '').trim()) return;
    field.value = value;
    field.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const launchDate = String(form.elements.namedItem('launchDate')?.value || '').trim();
  setValue('productType', template.type);
  launchStageConfigs().forEach((config) => {
    const templateStage = template.stages[launchStageTemplateKey(config.status)];
    if (!templateStage) return;
    setValue(config.status, 'Не начато', { onlyEmpty: true });
    const due = launchDate
      ? launchDateOffset(launchDate, -Math.abs(templateStage.dueBeforeLaunch || 0))
      : plusDays(templateStage.fallbackDays || 3);
    setValue(config.due, due, { onlyEmpty: true });
    setValue(config.comment, templateStage.comment || config.hint || '', { onlyEmpty: true });
  });
  return true;
}

function renderLaunchTemplateBar(currentItem = {}) {
  return `
    <div class="launch-template-bar">
      <div>
        <strong>Шаблон этапов</strong>
        <span class="muted small">Сроки и комментарии заполняются в пустые поля.</span>
      </div>
      <div class="quick-actions">
        ${LAUNCH_PRODUCT_TEMPLATES.map((template) => `<button class="quick-chip" type="button" data-launch-template="${escapeHtml(template.key)}">${escapeHtml(template.label)}</button>`).join('')}
      </div>
    </div>
  `;
}

const LAUNCH_STAGE_STATUS_COLUMNS = [
  { key: 'todo', label: 'Не начато', value: 'Не начато', tone: '' },
  { key: 'doing', label: 'В работе', value: 'В работе', tone: 'info' },
  { key: 'waiting', label: 'Ждем ответ', value: 'Ждем ответ', tone: 'warn' },
  { key: 'blocked', label: 'Блокер', value: 'Блокер', tone: 'danger' },
  { key: 'done', label: 'Готово', value: 'Готово', tone: 'ok' }
];

function launchStageColumnKey(status = '') {
  const raw = String(status || '').trim().toLowerCase();
  if (!raw || /не\s*нач|чернов|нов/.test(raw)) return 'todo';
  if (/готов|получен|контракт|заказ|ready|live|продаж|масштаб/.test(raw)) return 'done';
  if (/блок|стоп|пауза|риск|отказ|не\s*запуска/.test(raw)) return 'blocked';
  if (/ждем|ждём|ожид|ответ|кп|образец/.test(raw)) return 'waiting';
  if (/работ|соглас|производ|запрош|услов|цена|контент|карточ|дизайн|тест/.test(raw)) return 'doing';
  return 'todo';
}

function launchStageColumnMeta(status = '') {
  const key = launchStageColumnKey(status);
  return LAUNCH_STAGE_STATUS_COLUMNS.find((column) => column.key === key) || LAUNCH_STAGE_STATUS_COLUMNS[0];
}

function launchStageColumnValue(columnKey = '') {
  return (LAUNCH_STAGE_STATUS_COLUMNS.find((column) => column.key === columnKey) || LAUNCH_STAGE_STATUS_COLUMNS[0]).value;
}

function launchTaskTone(status = '') {
  const raw = String(status || '').toLowerCase();
  if (/готов/.test(raw)) return 'ok';
  if (/блок|стоп|пауза|риск/.test(raw)) return 'danger';
  if (/ждем|ожид|ответ|образец|кп/.test(raw)) return 'warn';
  if (/работ|соглас|производ|заказ|контракт/.test(raw)) return 'info';
  return 'warn';
}

function launchStageConfigs() {
  return [
    {
      title: 'Переговоры',
      hint: 'условия, цена, КП, договоренности',
      status: 'negotiationStatus',
      owner: 'negotiationOwner',
      due: 'negotiationDue',
      since: 'negotiationSince',
      comment: 'negotiationComment',
      statusOptions: launchNegotiationStatusOptionsHtml
    },
    {
      title: 'Пробный образец',
      hint: 'запрошен, получен, тестируется',
      status: 'sampleStatus',
      owner: 'sampleOwner',
      due: 'sampleDue',
      since: 'sampleSince',
      comment: 'sampleComment'
    },
    {
      title: 'Производство',
      hint: 'MOQ, срок партии, бронь сырья',
      status: 'productionStatus',
      owner: 'productionOwner',
      due: 'productionDue',
      since: 'productionSince',
      comment: 'productionComment'
    },
    {
      title: 'Упаковка / документы',
      hint: 'этикетка, сертификаты, макеты',
      status: 'packagingStatus',
      owner: 'packagingOwner',
      due: 'packagingDue',
      since: 'packagingSince',
      comment: 'packagingComment'
    },
    {
      title: 'Карточка / SKU',
      hint: 'контент, фото, связка SKU',
      status: 'contentStatus',
      owner: 'contentOwner',
      due: 'contentDue',
      since: 'contentSince',
      comment: 'contentComment'
    },
    {
      title: 'Запуск',
      hint: 'READY, поставка, площадки, задача',
      status: 'launchReadinessStatus',
      owner: 'launchReadinessOwner',
      due: 'launchReadinessDue',
      since: 'launchReadinessSince',
      comment: 'launchReadinessComment'
    }
  ];
}

function launchStageAgeDays(item = {}, config = {}) {
  const since = String(item[config.since] || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return null;
  const diff = diffFromTodayInDays(since);
  return Number.isFinite(diff) ? Math.max(0, -diff) : null;
}

function launchStageDueDays(item = {}, config = {}) {
  const due = String(item[config.due] || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  const diff = diffFromTodayInDays(due);
  return Number.isFinite(diff) ? diff : null;
}

function launchStageAgeText(item = {}, config = {}) {
  const ageDays = launchStageAgeDays(item, config);
  if (ageDays === null) return 'в колонке: новая запись';
  if (ageDays === 0) return 'в колонке: сегодня';
  return `в колонке ${fmt.int(ageDays)} дн.`;
}

function launchStageDueText(item = {}, config = {}) {
  const dueDays = launchStageDueDays(item, config);
  if (dueDays === null) return '';
  if (dueDays < 0) return `просрочено ${fmt.int(Math.abs(dueDays))} дн.`;
  if (dueDays === 0) return 'срок сегодня';
  return `до срока ${fmt.int(dueDays)} дн.`;
}

function launchStageEntries(item = {}) {
  const fallbackOwner = launchCurrentOwner(item);
  return launchStageConfigs().map((config) => {
    const status = String(item[config.status] || '').trim();
    const column = launchStageColumnMeta(status);
    const dueDays = launchStageDueDays(item, config);
    const ageDays = launchStageAgeDays(item, config);
    const done = column.key === 'done';
    const stale = !done && ((column.key === 'waiting' && ageDays !== null && ageDays >= 7) || (dueDays !== null && dueDays < 0));
    const stageOwner = launchOwnerValue(item[config.owner] || '') || fallbackOwner;
    return {
      config,
      status,
      column,
      done,
      stale,
      ageDays,
      dueDays,
      due: String(item[config.due] || '').trim(),
      owner: stageOwner,
      comment: String(item[config.comment] || '').trim()
    };
  });
}

function launchCurrentStageEntry(item = {}) {
  const entries = launchStageEntries(item);
  return entries.find((entry) => !entry.done && entry.status) || entries.find((entry) => !entry.done) || entries[entries.length - 1];
}

function launchReadinessChecks(item = {}) {
  const stageEntries = launchStageEntries(item);
  const stageByStatus = new Map(stageEntries.map((entry) => [entry.config.status, entry]));
  const hasSupply = Boolean(String(item.supplierName || item.factoryName || item.production || '').trim());
  const check = (key, label, ok, detail = '') => ({ key, label, ok: Boolean(ok), detail });
  return [
    check('owner', 'Owner назначен', launchHasOwner(item), launchCurrentOwner(item) || 'нужен ответственный'),
    check('supplier', 'Поставщик / завод заполнен', hasSupply, launchSupplyLabel(item) || 'нужен поставщик, завод или условия'),
    check('negotiation', 'Переговоры закрыты', stageByStatus.get('negotiationStatus')?.done, item.negotiationStatus || 'нужно закрыть переговоры'),
    check('sample', 'Образец готов', stageByStatus.get('sampleStatus')?.done, item.sampleStatus || 'нужен статус образца'),
    check('production', 'Производство готово', stageByStatus.get('productionStatus')?.done, item.productionStatus || 'нужен статус производства'),
    check('packaging', 'Упаковка / документы готовы', stageByStatus.get('packagingStatus')?.done, item.packagingStatus || 'нужен статус упаковки и документов'),
    check('sku', 'SKU связан', launchHasLinkedSku(item), item.articleKey || 'нужна связка с реестром SKU'),
    check('content', 'Карточка / SKU готовы', stageByStatus.get('contentStatus')?.done, item.contentStatus || 'нужен статус карточки'),
    check('marketplaces', 'Площадки выбраны', String(item.marketplaces || '').trim(), item.marketplaces || 'нужны WB / Ozon / другие площадки'),
    check('materials', 'Материалы есть', launchHasPresentation(item), item.presentationUrl || 'нужна презентация / материалы'),
    check('gantt', 'Календарь запуска заполнен', launchHasGantt(item), launchHasGantt(item) ? 'месяцы отмечены' : 'нужно отметить месяцы'),
    check('launchTask', 'Задача запуска стоит', launchHasActiveTasks(item), item.activeTasks ? `${fmt.int(item.activeTasks)} активн.` : 'нужна задача с owner и сроком'),
    check('decision', 'Решение по запуску принято', launchFinalDecisionApproved(item), item.launchDecision || 'нужно финальное решение'),
    check('launch', 'Запуск готов', stageByStatus.get('launchReadinessStatus')?.done || launchFinalStatusReady(item), item.launchReadinessStatus || item.status || 'нужен финальный статус')
  ];
}

function launchReadinessState(item = {}) {
  const checks = launchReadinessChecks(item);
  const missing = checks.filter((entry) => !entry.ok);
  return {
    checks,
    missing,
    ready: missing.length === 0,
    pct: checks.length ? (checks.length - missing.length) / checks.length : 0
  };
}

function launchNowSummary(item = {}) {
  const liveItem = normalizeLaunchItem(item);
  const readiness = launchReadinessState(liveItem);
  const currentStage = launchCurrentStageEntry(liveItem);
  const task = sortTasks(launchLinkedTasks(liveItem).filter(isTaskActive))[0] || null;
  const due = currentStage?.due || task?.due || launchDueDateKey(liveItem) || '';
  const owner = currentStage?.owner || task?.owner || liveItem.owner || '';
  const blocker = readiness.missing[0]?.detail || (liveItem.blockers || [])[0] || '';
  return {
    item: liveItem,
    readiness,
    currentStage,
    task,
    action: launchDirectorNextAction(liveItem),
    owner,
    due,
    blocker
  };
}

function renderLaunchStageTaskCard(item = {}, config = {}) {
  const statusValue = item[config.status] || '';
  const columnMeta = launchStageColumnMeta(statusValue);
  const tone = launchTaskTone(statusValue || columnMeta.value);
  const statusOptions = config.statusOptions || launchTaskStatusOptionsHtml;
  const dueText = launchStageDueText(item, config);
  const ageText = launchStageAgeText(item, config);
  const entry = launchStageEntries(item).find((stage) => stage.config.status === config.status);
  const stale = entry?.stale;
  const ownerValue = entry?.owner || '';
  const dueValue = entry?.due || '';
  const commentValue = entry?.comment || '';
  return `
    <div class="launch-task-card launch-task-${tone} ${stale ? 'is-stale' : ''}" draggable="true" data-launch-stage-card data-launch-stage-field="${escapeHtml(config.status)}" data-launch-stage-current="${escapeHtml(columnMeta.key)}">
      <div class="launch-task-card-head">
        <div>
          <strong>${escapeHtml(config.title)}</strong>
          <span>${escapeHtml(config.hint || '')}</span>
        </div>
        <span class="chip ${escapeHtml(columnMeta.tone || tone)}" data-launch-stage-status-chip>${escapeHtml(statusValue || columnMeta.value)}</span>
      </div>
      <div class="launch-task-card-topline">
        <span class="launch-stage-owner-chip ${ownerValue ? '' : 'is-missing'}" data-launch-stage-owner-chip>${escapeHtml(ownerValue || 'назначить owner')}</span>
        <span class="launch-stage-date-chip ${dueValue ? '' : 'is-missing'}" data-launch-stage-date-chip>${escapeHtml(dueValue || 'срок не задан')}</span>
      </div>
      <input type="hidden" name="${escapeHtml(config.since)}" value="${escapeHtml(item[config.since] || '')}">
      <div class="launch-task-age ${stale ? 'warn' : ''}" data-launch-stage-age>${escapeHtml([ageText, dueText].filter(Boolean).join(' · '))}</div>
      <div class="launch-stage-brief">${escapeHtml(commentValue || config.hint || 'Следующий шаг не описан')}</div>
      <div class="launch-task-fields">
        <label><span class="muted small">Статус</span><select name="${escapeHtml(config.status)}">${statusOptions(statusValue)}</select></label>
        <label><span class="muted small">Срок</span><input name="${escapeHtml(config.due)}" type="date" value="${escapeHtml(item[config.due] || '')}"></label>
        <label class="span-all"><span class="muted small">Ответственный / контакт</span><input name="${escapeHtml(config.owner)}" value="${escapeHtml(ownerValue)}" placeholder="кто ведет этот шаг"></label>
        <label class="span-all"><span class="muted small">Комментарий</span><textarea name="${escapeHtml(config.comment)}" rows="2" placeholder="что происходит, что ждем, следующий шаг">${escapeHtml(item[config.comment] || '')}</textarea></label>
      </div>
      <div class="launch-task-move-row">
        <button class="quick-chip" type="button" data-launch-stage-move="prev">Влево</button>
        <button class="quick-chip" type="button" data-launch-stage-move="next">Дальше</button>
      </div>
    </div>
  `;
}

function renderLaunchStageTaskBoard(item = {}) {
  const configs = launchStageConfigs();
  const entries = launchStageEntries(item);
  const doneCount = entries.filter((entry) => entry.done).length;
  const blockerCount = entries.filter((entry) => entry.column.key === 'blocked').length;
  const waitingCount = entries.filter((entry) => entry.column.key === 'waiting').length;
  const ownerCount = entries.filter((entry) => entry.owner).length;
  return `
    <div class="launch-stage-board-wrap">
      <div class="launch-stage-summary">
        <div><span>готово</span><strong>${fmt.int(doneCount)} / ${fmt.int(entries.length)}</strong></div>
        <div><span>owner</span><strong>${fmt.int(ownerCount)} / ${fmt.int(entries.length)}</strong></div>
        <div><span>ждём</span><strong>${fmt.int(waitingCount)}</strong></div>
        <div class="${blockerCount ? 'danger' : 'ok'}"><span>блокеры</span><strong>${fmt.int(blockerCount)}</strong></div>
      </div>
      <div class="launch-task-board" data-launch-stage-board>
        ${LAUNCH_STAGE_STATUS_COLUMNS.map((column) => {
          const cards = configs
            .filter((config) => launchStageColumnKey(item[config.status]) === column.key)
            .map((config) => renderLaunchStageTaskCard(item, config))
            .join('');
          return `
            <div class="launch-task-column" data-launch-stage-column="${escapeHtml(column.key)}">
              <div class="launch-task-column-head">
                <strong>${escapeHtml(column.label)}</strong>
                <span data-launch-stage-count>${fmt.int(cards ? (cards.match(/data-launch-stage-card/g) || []).length : 0)}</span>
              </div>
              <div class="launch-task-list" data-launch-stage-list="${escapeHtml(column.key)}">
                ${cards}
                <div class="launch-stage-empty" data-launch-stage-empty ${cards ? 'hidden' : ''}>Перетащите этап сюда</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function launchStageSetSelectValue(select, value) {
  if (!select) return;
  const normalized = String(value || '').trim();
  if (!normalized) return;
  const exists = Array.from(select.options || []).some((option) => option.value === normalized);
  if (!exists) select.insertBefore(new Option(normalized, normalized), select.firstChild);
  select.value = normalized;
}

function launchStageRefreshColumnCounts(board) {
  if (!board) return;
  board.querySelectorAll('[data-launch-stage-column]').forEach((column) => {
    const cards = column.querySelectorAll('[data-launch-stage-card]');
    const counter = column.querySelector('[data-launch-stage-count]');
    const empty = column.querySelector('[data-launch-stage-empty]');
    if (counter) counter.textContent = fmt.int(cards.length);
    if (empty) empty.hidden = cards.length > 0;
  });
}

function launchStageRefreshCard(card) {
  if (!card) return;
  const select = card.querySelector('select');
  const statusValue = String(select?.value || '').trim();
  const columnMeta = launchStageColumnMeta(statusValue);
  const tone = launchTaskTone(statusValue || columnMeta.value);
  const config = launchStageConfigs().find((entry) => entry.status === card.getAttribute('data-launch-stage-field'));
  const ownerInput = config ? card.querySelector(`[name="${config.owner}"]`) : null;
  const dueInput = config ? card.querySelector(`[name="${config.due}"]`) : null;
  const commentInput = config ? card.querySelector(`[name="${config.comment}"]`) : null;
  card.dataset.launchStageCurrent = columnMeta.key;
  card.classList.remove('launch-task-ok', 'launch-task-warn', 'launch-task-danger', 'launch-task-info', 'is-stale');
  if (tone) card.classList.add(`launch-task-${tone}`);
  const chip = card.querySelector('[data-launch-stage-status-chip]');
  if (chip) {
    chip.className = `chip ${columnMeta.tone || tone}`.trim();
    chip.textContent = statusValue || columnMeta.value;
  }
  const ownerChip = card.querySelector('[data-launch-stage-owner-chip]');
  if (ownerChip) {
    const ownerValue = launchOwnerValue(ownerInput?.value || '');
    ownerChip.textContent = ownerValue || 'назначить owner';
    ownerChip.classList.toggle('is-missing', !ownerValue);
  }
  const dueChip = card.querySelector('[data-launch-stage-date-chip]');
  if (dueChip) {
    const dueValue = String(dueInput?.value || '').trim();
    dueChip.textContent = dueValue || 'срок не задан';
    dueChip.classList.toggle('is-missing', !dueValue);
  }
  const brief = card.querySelector('.launch-stage-brief');
  if (brief) brief.textContent = String(commentInput?.value || config?.hint || 'Следующий шаг не описан').trim();
  const age = card.querySelector('[data-launch-stage-age]');
  const since = card.querySelector('input[type="hidden"]')?.value || '';
  if (age) {
    const days = /^\d{4}-\d{2}-\d{2}$/.test(since) ? Math.max(0, -diffFromTodayInDays(since)) : null;
    const dueValue = String(dueInput?.value || '').trim();
    const dueDays = /^\d{4}-\d{2}-\d{2}$/.test(dueValue) ? diffFromTodayInDays(dueValue) : null;
    const dueLabel = dueDays === null ? '' : dueDays < 0 ? `просрочено ${fmt.int(Math.abs(dueDays))} дн.` : dueDays === 0 ? 'срок сегодня' : `до срока ${fmt.int(dueDays)} дн.`;
    age.classList.remove('warn');
    if (dueDays !== null && dueDays < 0) age.classList.add('warn');
    const ageLabel = days === null ? 'в колонке: новая запись' : days === 0 ? 'в колонке: сегодня' : `в колонке ${fmt.int(days)} дн.`;
    age.textContent = [ageLabel, dueLabel].filter(Boolean).join(' · ');
  }
}

function launchStageMoveCard(board, card, columnKey) {
  if (!board || !card || !columnKey) return;
  const list = board.querySelector(`[data-launch-stage-list="${columnKey}"]`);
  if (!list) return;
  const select = card.querySelector('select');
  launchStageSetSelectValue(select, launchStageColumnValue(columnKey));
  const sinceInput = card.querySelector('input[type="hidden"]');
  if (sinceInput) sinceInput.value = todayIso();
  list.appendChild(card);
  launchStageRefreshCard(card);
  launchStageRefreshColumnCounts(board);
}

function bindLaunchStageTaskBoard(root) {
  const board = root?.querySelector('[data-launch-stage-board]');
  if (!board) return;
  launchStageRefreshColumnCounts(board);

  board.querySelectorAll('[data-launch-stage-card]').forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      if (event.target?.closest?.('input, textarea, select, button')) {
        event.preventDefault();
        return;
      }
      card.classList.add('is-dragging');
      event.dataTransfer?.setData('text/plain', card.getAttribute('data-launch-stage-field') || '');
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      board.querySelectorAll('.is-drop-target').forEach((column) => column.classList.remove('is-drop-target'));
    });
    card.querySelector('select')?.addEventListener('change', () => {
      const sinceInput = card.querySelector('input[type="hidden"]');
      if (sinceInput) sinceInput.value = todayIso();
      const columnKey = launchStageColumnKey(card.querySelector('select')?.value || '');
      const currentList = card.closest('[data-launch-stage-list]');
      if (currentList?.getAttribute('data-launch-stage-list') !== columnKey) {
        launchStageMoveCard(board, card, columnKey);
      } else {
        launchStageRefreshCard(card);
        launchStageRefreshColumnCounts(board);
      }
    });
    card.querySelectorAll('[data-launch-stage-move]').forEach((button) => {
      button.addEventListener('click', () => {
        const currentKey = card.closest('[data-launch-stage-list]')?.getAttribute('data-launch-stage-list') || launchStageColumnKey(card.querySelector('select')?.value || '');
        const currentIndex = LAUNCH_STAGE_STATUS_COLUMNS.findIndex((column) => column.key === currentKey);
        const direction = button.getAttribute('data-launch-stage-move') === 'prev' ? -1 : 1;
        const nextColumn = LAUNCH_STAGE_STATUS_COLUMNS[Math.min(Math.max(currentIndex + direction, 0), LAUNCH_STAGE_STATUS_COLUMNS.length - 1)];
        if (nextColumn) launchStageMoveCard(board, card, nextColumn.key);
      });
    });
    card.querySelectorAll('input, textarea').forEach((field) => {
      if (field.type === 'hidden') return;
      field.addEventListener('input', () => launchStageRefreshCard(card));
      field.addEventListener('change', () => launchStageRefreshCard(card));
    });
  });

  board.querySelectorAll('[data-launch-stage-column]').forEach((column) => {
    column.addEventListener('dragover', (event) => {
      event.preventDefault();
      column.classList.add('is-drop-target');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });
    column.addEventListener('dragleave', (event) => {
      if (!column.contains(event.relatedTarget)) column.classList.remove('is-drop-target');
    });
    column.addEventListener('drop', (event) => {
      event.preventDefault();
      column.classList.remove('is-drop-target');
      const statusField = event.dataTransfer?.getData('text/plain') || '';
      const card = Array.from(board.querySelectorAll('[data-launch-stage-card]'))
        .find((entry) => entry.getAttribute('data-launch-stage-field') === statusField);
      launchStageMoveCard(board, card, column.getAttribute('data-launch-stage-column') || '');
    });
  });
}

async function createLaunchStageTasks(item = {}) {
  if (typeof createManualTask !== 'function') return { created: 0, skipped: 0 };
  const liveItem = normalizeLaunchItem(item, { skipTaskLookup: true });
  const itemName = liveItem.name || liveItem.articleKey || 'Новинка';
  const nameKey = String(itemName || '').trim().toLowerCase();
  const activeTasks = getAllTasks().filter((task) => isTaskActive(task) && task.type === 'launch');
  let created = 0;
  let skipped = 0;

  for (const entry of launchStageEntries(liveItem)) {
    if (entry.done) {
      skipped += 1;
      continue;
    }
    const stageTitle = entry.config.title;
    const hasDuplicate = activeTasks.some((task) => {
      const sameProduct = (liveItem.articleKey && task.articleKey === liveItem.articleKey)
        || String(task.entityLabel || '').trim().toLowerCase() === nameKey;
      return sameProduct && String(task.title || '').toLowerCase().includes(stageTitle.toLowerCase());
    });
    if (hasDuplicate) {
      skipped += 1;
      continue;
    }
    const due = entry.due || launchDueDateKey(liveItem) || plusDays(3 + created * 2);
    const dueDays = /^\d{4}-\d{2}-\d{2}$/.test(due) ? diffFromTodayInDays(due) : 7;
    await createManualTask({
      articleKey: liveItem.articleKey || '',
      entityLabel: itemName,
      title: `${stageTitle}: ${itemName}`,
      type: 'launch',
      priority: Number.isFinite(dueDays) && dueDays <= 0 ? 'critical' : Number.isFinite(dueDays) && dueDays <= 5 ? 'high' : 'medium',
      platform: 'product',
      owner: entry.owner || liveItem.owner || '',
      due,
      nextAction: entry.comment || entry.config.hint || launchDirectorNextAction(liveItem),
      reason: `Этап карточки продукта · ${stageTitle} · ${liveItem.launchMonth || 'без месяца'}`,
      skipRerender: true
    });
    created += 1;
  }

  return { created, skipped };
}

async function createLaunchNextStageTask(item = {}) {
  if (typeof createManualTask !== 'function') return { created: 0, skipped: 0 };
  const liveItem = normalizeLaunchItem(item, { skipTaskLookup: true });
  const itemName = liveItem.name || liveItem.articleKey || 'Новинка';
  const nameKey = String(itemName || '').trim().toLowerCase();
  const stage = launchStageEntries(liveItem)
    .filter((entry) => !entry.done)
    .sort((left, right) => {
      const leftDue = left.dueDays === null ? 9999 : left.dueDays;
      const rightDue = right.dueDays === null ? 9999 : right.dueDays;
      return leftDue - rightDue;
    })[0];
  if (!stage) return { created: 0, skipped: 1 };
  const stageTitle = stage.config.title;
  const duplicate = getAllTasks().some((task) => {
    if (!isTaskActive(task) || task.type !== 'launch') return false;
    const sameProduct = (liveItem.articleKey && task.articleKey === liveItem.articleKey)
      || String(task.entityLabel || '').trim().toLowerCase() === nameKey;
    return sameProduct && String(task.title || '').toLowerCase().includes(stageTitle.toLowerCase());
  });
  if (duplicate) return { created: 0, skipped: 1 };
  const due = stage.due || launchDueDateKey(liveItem) || plusDays(3);
  const dueDays = /^\d{4}-\d{2}-\d{2}$/.test(due) ? diffFromTodayInDays(due) : 7;
  await createManualTask({
    articleKey: liveItem.articleKey || '',
    entityLabel: itemName,
    title: `${stageTitle}: ${itemName}`,
    type: 'launch',
    priority: Number.isFinite(dueDays) && dueDays <= 0 ? 'critical' : Number.isFinite(dueDays) && dueDays <= 5 ? 'high' : 'medium',
    platform: 'product',
    owner: stage.owner || liveItem.owner || '',
    due,
    nextAction: stage.comment || stage.config.hint || launchDirectorNextAction(liveItem),
    reason: `Ближайший этап карточки продукта · ${stageTitle} · ${liveItem.launchMonth || 'без месяца'}`,
    skipRerender: true
  });
  return { created: 1, skipped: 0 };
}

function launchNegotiationRedReason(item = {}) {
  const liveItem = normalizeLaunchItem(item, { skipTaskLookup: true });
  const entry = launchStageEntries(liveItem).find((stage) => stage.config.status === 'negotiationStatus');
  const statusText = String(liveItem.negotiationStatus || '').trim();
  const raw = `${statusText} ${liveItem.negotiationComment || ''}`.toLowerCase();
  if (!String(liveItem.supplierName || liveItem.factoryName || liveItem.production || '').trim()) return 'нет поставщика или завода';
  if (entry?.column?.key === 'blocked') return statusText || 'переговоры заблокированы';
  if (entry?.dueDays !== null && entry?.dueDays < 0) return `срок переговоров просрочен на ${fmt.int(Math.abs(entry.dueDays))} дн.`;
  if (entry?.column?.key === 'waiting' && entry?.ageDays !== null && entry.ageDays >= 7) return `ждем ответ ${fmt.int(entry.ageDays)} дн.`;
  if (/ждем|ждём|кп|ответ/.test(raw) && entry?.ageDays !== null && entry.ageDays >= 5) return `зависло: ${statusText || 'ждем ответ'}`;
  return '';
}

function launchRedZoneItems(items = []) {
  return (items || [])
    .map((item) => {
      const liveItem = normalizeLaunchItem(item, { skipTaskLookup: true });
      return { item: liveItem, reason: launchNegotiationRedReason(liveItem) };
    })
    .filter((entry) => entry.reason)
    .sort((left, right) => launchDirectorPriority(right.item) - launchDirectorPriority(left.item) || left.item.name.localeCompare(right.item.name, 'ru'))
    .slice(0, 8);
}

function renderLaunchRedZone(items = []) {
  const rows = launchRedZoneItems(items);
  return `
    <div class="card launch-red-zone-card">
      <div class="section-subhead">
        <div>
          <h3>Красная зона переговоров</h3>
          <p class="small muted">То, что тормозит запуск на стороне поставщика, завода или КП.</p>
        </div>
        ${rows.length ? badge(`${fmt.int(rows.length)} в красной зоне`, 'danger') : badge('переговоры спокойные', 'ok')}
      </div>
      <div class="launch-red-zone-list">
        ${rows.map(({ item, reason }) => `
          <button class="launch-red-zone-row" type="button" data-launch-edit="${escapeHtml(item.id)}">
            <span class="launch-red-dot"></span>
            <strong>${escapeHtml(item.name || item.articleKey || 'Новинка')}</strong>
            <span>${escapeHtml(reason)}</span>
            <em>${escapeHtml(item.negotiationOwner || item.owner || 'без owner')}</em>
          </button>
        `).join('') || '<div class="empty">Сейчас нет зависших переговоров.</div>'}
      </div>
    </div>
  `;
}

function renderLaunchExcelMenu(label = 'Меню запуска') {
  return `
    <details class="launch-excel-menu launch-action-menu">
      <summary class="launch-action-menu-trigger">
        <span class="launch-action-menu-mark">...</span>
        <span class="launch-action-menu-copy">
          <b>${escapeHtml(label)}</b>
          <em>Excel / отбор / календарь</em>
        </span>
      </summary>
      <div class="launch-excel-menu-panel">
        <div class="launch-excel-menu-head">
          <span>рабочие действия</span>
          <strong>Запуск новинок</strong>
        </div>
        <button class="launch-menu-action" type="button" data-launch-import>
          <b>Загрузить файл</b>
          <span>Excel / HTML / CSV из рабочего файла</span>
        </button>
        <button class="launch-menu-action" type="button" data-launch-download-form>
          <b>Скачать форму</b>
          <span>шаблон для обновления новинок</span>
        </button>
        <button class="launch-menu-action" type="button" data-launch-export="product">
          <b>Выгрузить отбор</b>
          <span>текущий фильтр в Excel</span>
        </button>
        <button class="launch-menu-action" type="button" data-launch-show-gantt>
          <b>Календарь этапов</b>
          <span>открыть календарь запуска по фильтру</span>
        </button>
        <button class="launch-menu-action is-muted" type="button" data-launch-reset>
          <b>Сбросить фильтры</b>
          <span>вернуть общий список</span>
        </button>
      </div>
    </details>
  `;
}

function renderLaunchCommandStrip(summary = {}) {
  const total = numberOrZero(summary.total);
  const focus = numberOrZero(summary.focus);
  const ready = numberOrZero(summary.ready);
  const ownerRisk = numberOrZero(summary.ownerRisk);
  const skuRisk = numberOrZero(summary.skuRisk);
  return `
    <div class="launch-command-strip">
      <div class="launch-command-main">
        <span>рабочее меню</span>
        <strong>Запуски: карточка, файл, календарь</strong>
        <em>${fmt.int(total)} новинок в текущем контуре</em>
      </div>
      <div class="launch-command-metrics">
        <div class="ok"><span>готово</span><strong>${fmt.int(ready)}</strong></div>
        <div class="${focus ? 'warn' : 'ok'}"><span>в фокусе</span><strong>${fmt.int(focus)}</strong></div>
        <div class="${ownerRisk ? 'danger' : 'ok'}"><span>без owner</span><strong>${fmt.int(ownerRisk)}</strong></div>
        <div class="${skuRisk ? 'warn' : 'ok'}"><span>без SKU</span><strong>${fmt.int(skuRisk)}</strong></div>
      </div>
      <div class="launch-command-actions">
        <button class="launch-command-add" type="button" data-launch-add>
          <b>Новая карточка</b>
          <span>товар + этапы</span>
        </button>
        ${renderLaunchExcelMenu('Меню запуска')}
      </div>
    </div>
  `;
}

function renderLaunchAttentionPanel(items = [], summary = {}) {
  const focusItems = (items || []).slice(0, 5);
  const chips = [
    { label: `${fmt.int(summary.total || 0)} в отборе`, tone: 'info' },
    { label: `${fmt.int(summary.withoutOwner || 0)} без owner`, tone: summary.withoutOwner ? 'warn' : 'ok' },
    { label: `${fmt.int(summary.withoutSku || 0)} без SKU`, tone: summary.withoutSku ? 'warn' : 'ok' },
    { label: `${fmt.int(summary.withoutMaterials || 0)} без материалов`, tone: summary.withoutMaterials ? 'warn' : 'ok' },
    { label: `${fmt.int(summary.ready || 0)} готово`, tone: summary.ready ? 'ok' : 'warn' }
  ];
  return `
    <div class="card launch-attention-card">
      <div class="section-subhead">
        <div>
          <h3>Что требует внимания</h3>
          <p class="small muted">Короткий список того, что мешает запуску прямо сейчас.</p>
        </div>
        <div class="badge-stack">${chips.map((entry) => badge(entry.label, entry.tone)).join('')}</div>
      </div>
      <div class="launch-attention-list">
        ${focusItems.map((item) => `
          <button class="launch-attention-row" type="button" data-launch-edit="${escapeHtml(item.id)}">
            <span class="launch-attention-status ${launchIsReady(item) ? 'ok' : (item.blockers || []).length ? 'danger' : 'warn'}"></span>
            <strong>${escapeHtml(item.name || item.articleKey || 'Новинка')}</strong>
            <em>${escapeHtml(launchDirectorNextAction(item))}</em>
            <small>${escapeHtml(item.owner || 'без owner')} · ${escapeHtml(launchDueDateLabel(item))}</small>
          </button>
        `).join('') || '<div class="empty">По текущему фильтру критичных дыр нет.</div>'}
      </div>
    </div>
  `;
}

function launchFinalStatusReady(item = {}) {
  const statusRaw = String(item.status || '').toLowerCase();
  const launchRaw = String(item.launchReadinessStatus || '').toLowerCase();
  return /готово к запуску|в продаже|масштаб/.test(statusRaw) || /готов/.test(launchRaw) || launchFinalDecisionApproved(item);
}

function launchFinalDecisionApproved(item = {}) {
  const decisionRaw = String(item.launchDecision || '').trim().toLowerCase();
  if (!decisionRaw) return false;
  if (/пауза|стоп|отказ|не\s*запуска|hold|no-go/.test(decisionRaw)) return false;
  return /запуск|запускаем|go|утвержд|да|готов/.test(decisionRaw);
}

function launchDirectorNextAction(item = {}) {
  if (!launchHasOwner(item)) return 'Назначить owner и зону ответственности';
  if (!String(item.supplierName || item.factoryName || item.production || '').trim()) return 'Заполнить поставщика, завод или производство';
  if (!String(item.negotiationStatus || '').trim()) return 'Указать статус переговоров с поставщиком';
  if (!String(item.sampleStatus || '').trim()) return 'Зафиксировать статус пробного образца';
  if (!String(item.productionStatus || '').trim()) return 'Зафиксировать статус производства';
  if (!String(item.packagingStatus || '').trim()) return 'Зафиксировать упаковку, документы или макеты';
  if (!launchHasLinkedSku(item)) return 'Связать с реестром SKU или завести новый SKU';
  if (!String(item.contentStatus || '').trim()) return 'Зафиксировать статус карточки и контента';
  if (!String(item.marketplaces || '').trim()) return 'Выбрать площадки запуска: WB, Ozon или другие';
  if (!launchHasPresentation(item)) return 'Добавить презентацию, фото, карточку или ТЗ на контент';
  if (!launchHasGantt(item)) return 'Отметить месяц в календаре запуска и план запуска';
  if (!launchHasActiveTasks(item)) return 'Поставить задачу запуска с owner и сроком';
  if (!launchFinalDecisionApproved(item)) return 'Принять финальное решение: запускаем, пауза или не запускаем';
  if (!launchFinalStatusReady(item)) return 'Поставить финальный статус запуска: Готово';
  if ((item.blockers || []).length) return `Закрыть блокер: ${item.blockers[0]}`;
  return 'Готово к запуску: вести факт, цены и первые продажи';
}

function launchDirectorPriority(item = {}) {
  let score = 0;
  const days = launchDaysUntil(item);
  if (!launchHasOwner(item)) score += 80;
  if (!launchHasLinkedSku(item)) score += 70;
  if (!launchHasPresentation(item)) score += 55;
  if (!launchHasGantt(item)) score += 45;
  if ((item.blockers || []).length) score += 35;
  if (Number.isFinite(days) && days <= 45) score += 30;
  if (Number.isFinite(days) && days < 0) score += 20;
  return score;
}

function renderLaunchDirectorCard(item = {}) {
  const phaseMeta = launchPhaseMeta(item.phase);
  const daysUntil = launchDaysUntil(item);
  const timingLabel = !Number.isFinite(daysUntil)
    ? 'без точной даты'
    : daysUntil < 0
      ? `в запуске ${fmt.int(Math.abs(daysUntil))} дн.`
      : `до запуска ${fmt.int(daysUntil)} дн.`;
  const checklist = [
    { ok: launchHasOwner(item), label: item.owner ? `Owner: ${item.owner}` : 'Owner не назначен' },
    { ok: Boolean(String(item.supplierName || item.factoryName || item.production || '').trim()), label: launchSupplyLabel(item) || 'Поставщик / завод не заполнены' },
    { ok: launchHasLinkedSku(item), label: item.articleKey ? `SKU: ${item.articleKey}` : 'SKU не связан' },
    { ok: Boolean(String(item.marketplaces || '').trim()), label: item.marketplaces || 'Площадки не выбраны' },
    { ok: launchHasPresentation(item), label: launchHasPresentation(item) ? 'Материалы есть' : 'Нет материалов' },
    { ok: launchHasGantt(item), label: launchHasGantt(item) ? 'Календарь есть' : 'Нет календаря' }
  ];
  return `
    <div class="launch-director-card">
      <div class="head">
        <div>
          <strong>${item.articleKey ? linkToSku(item.articleKey, item.name || item.articleKey) : escapeHtml(item.name || 'Новая новинка')}</strong>
          <div class="muted small">${escapeHtml(item.reportGroup || 'Продукт')} · ${escapeHtml(item.subCategory || item.category || 'без категории')} · ${escapeHtml(launchDueDateLabel(item))}</div>
        </div>
        <div class="badge-stack">
          ${badge(phaseMeta.label, phaseMeta.tone)}
          ${badge(timingLabel, Number.isFinite(daysUntil) && daysUntil <= 21 ? 'warn' : 'info')}
        </div>
      </div>
      <div class="launch-next-action">${escapeHtml(launchDirectorNextAction(item))}</div>
      <div class="badge-stack launch-status-row">
        ${checklist.map((entry) => badge(entry.label, entry.ok ? 'ok' : 'warn')).join('')}
        ${badge(`${fmt.int(item.activeTasks || 0)} задач`, item.activeTasks ? 'warn' : 'ok')}
      </div>
      ${(item.productComment || item.negotiationComment) ? `<div class="launch-product-note">${escapeHtml(item.productComment || item.negotiationComment)}</div>` : ''}
      <div class="muted small">${escapeHtml(item.status || 'Статус не указан')}</div>
      <div class="quick-actions launch-card-actions">
        <button class="quick-chip portal-action-primary" type="button" data-launch-edit="${escapeHtml(item.id)}">Открыть карточку</button>
        <button class="quick-chip" type="button" data-launch-task="${escapeHtml(item.id)}">${item.activeTasks ? 'Открыть задачу' : 'Поставить задачу'}</button>
        ${item.presentationUrl ? launchLinkHtml(item.presentationUrl) : ''}
      </div>
    </div>
  `;
}

function renderLaunchDirectorGantt(items = [], columns = []) {
  if (!columns.length) return '<div class="empty">Календарь запуска по текущему фильтру пока пустой.</div>';
  const rows = items.slice(0, 18).map((item) => `
    <tr>
      <td class="launch-gantt-name">
        <strong>${escapeHtml(item.name || item.articleKey || 'Новинка')}</strong>
        <div class="muted small">${escapeHtml(item.owner || 'без owner')} · ${escapeHtml(item.status || 'без статуса')}</div>
      </td>
      ${columns.map((column) => {
        const active = (item.ganttMonths || []).some((entry) => `${entry.label} ${entry.year}` === column);
        return `<td class="${active ? 'launch-gantt-hit' : ''}">${active ? '●' : ''}</td>`;
      }).join('')}
    </tr>
  `).join('');
  return `
    <div class="table-wrap launch-gantt-wrap">
      <table class="launch-gantt-table">
        <thead>
          <tr>
            <th>Новинка</th>
            ${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function launchAutoGraphRows(items = []) {
  const rows = [];
  const pushRow = (row) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date || ''))) return;
    const key = [row.itemId, row.date, row.kind, row.label].join('|');
    if (rows.some((entry) => entry.__key === key)) return;
    rows.push({ ...row, __key: key, days: diffFromTodayInDays(row.date) });
  };

  (items || []).forEach((rawItem) => {
    const item = normalizeLaunchItem(rawItem);
    const itemLabel = item.name || item.articleKey || 'Новинка';
    launchStageEntries(item).forEach((entry) => {
      if (!entry.due || entry.done) return;
      pushRow({
        itemId: item.id,
        item,
        date: entry.due,
        kind: 'Этап',
        label: entry.config.title,
        owner: entry.owner || item.owner,
        status: entry.status || entry.column.value,
        source: 'карточка продукта',
        action: entry.comment || launchDirectorNextAction(item)
      });
    });

    sortTasks(launchLinkedTasks(item).filter(isTaskActive)).forEach((task) => {
      if (!task?.due) return;
      pushRow({
        itemId: item.id,
        item,
        date: task.due,
        kind: 'Задача',
        label: task.title || 'Задача запуска',
        owner: task.owner || item.owner,
        status: TASK_STATUS_META?.[task.status]?.label || task.status || 'активна',
        source: 'центр задач',
        action: task.nextAction || task.reason || launchDirectorNextAction(item)
      });
    });

    const launchDate = launchDueDateKey(item);
    if (launchDate) {
      pushRow({
        itemId: item.id,
        item,
        date: launchDate,
        kind: 'Запуск',
        label: itemLabel,
        owner: item.owner,
        status: launchReadinessState(item).ready ? 'готово' : 'не готово',
        source: item.launchDate ? 'точная дата' : 'месяц запуска',
        action: launchDirectorNextAction(item)
      });
    }
  });

  return rows
    .sort((left, right) => left.days - right.days || String(left.item.name || '').localeCompare(String(right.item.name || ''), 'ru'))
    .map(({ __key, ...row }) => row);
}

function launchTimelineMonthKey(dateKey = '') {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || '')) ? String(dateKey).slice(0, 7) : '';
}

function launchTimelineMonthLabel(monthKey = '') {
  const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey;
  return `${launchMonthName(Number(match[2]) - 1)} ${match[1]}`;
}

function launchTimelineDefaultMonths(count = 6) {
  const date = new Date();
  date.setDate(1);
  date.setHours(12, 0, 0, 0);
  return Array.from({ length: count }, (_, index) => {
    const month = new Date(date);
    month.setMonth(month.getMonth() + index);
    return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  });
}

function launchTimelineTone(row = {}) {
  if (row.days < 0) return 'danger';
  if (row.kind === 'Запуск' && /готов|запуск/.test(String(row.status || '').toLowerCase())) return 'ok';
  if (row.days <= 7) return 'warn';
  if (row.kind === 'Запуск') return 'ok';
  if (row.kind === 'Задача') return 'info';
  return 'stage';
}

function launchTimelineRowDateLabel(dateKey = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return 'дата';
  return String(Number(String(dateKey).slice(8, 10)));
}

function launchTimelineMonthTone(rows = []) {
  if (rows.some((row) => row.days < 0)) return 'danger';
  if (rows.some((row) => Number.isFinite(row.days) && row.days <= 14)) return 'warn';
  if (rows.length) return 'ok';
  return '';
}

function launchTimelineBucket(row = {}) {
  const item = row.item || {};
  if (!launchHasOwner(item)) return { key: 'no-owner', label: 'без owner', tone: 'warn', rank: 1 };
  if (!launchHasLinkedSku(item)) return { key: 'no-sku', label: 'без SKU', tone: 'warn', rank: 2 };
  if (!launchHasPresentation(item)) return { key: 'no-materials', label: 'без материалов', tone: 'warn', rank: 3 };
  if (!launchHasGantt(item)) return { key: 'no-calendar', label: 'без календаря', tone: 'warn', rank: 4 };
  if (row.days < 0 && !launchIsReady(item)) return { key: 'overdue', label: 'просрочено', tone: 'danger', rank: 0 };
  if (launchIsReady(item)) return { key: 'ready', label: 'готовы', tone: 'ok', rank: 6 };
  return { key: 'control', label: 'нужен контроль', tone: 'info', rank: 5 };
}

function launchTimelineMonthBuckets(rows = []) {
  const order = ['overdue', 'no-owner', 'no-sku', 'no-materials', 'no-calendar', 'control', 'ready'];
  const map = new Map();
  rows.forEach((row) => {
    const bucket = launchTimelineBucket(row);
    const current = map.get(bucket.key) || { ...bucket, count: 0 };
    current.count += 1;
    map.set(bucket.key, current);
  });
  return order.map((key) => map.get(key)).filter(Boolean);
}

function renderLaunchTimelineProductRow(row = {}) {
  const tone = launchTimelineTone(row);
  const bucket = launchTimelineBucket(row);
  const dateLabel = launchTimelineRowDateLabel(row.date);
  const title = row.item?.name || row.item?.articleKey || row.label || 'Новинка';
  const meta = [
    row.owner || row.item?.owner || 'без owner',
    row.status || bucket.label,
    row.action || launchDirectorNextAction(row.item || {})
  ].filter(Boolean).join(' · ');
  return `
    <button class="launch-month-product-row ${escapeHtml(tone)}" type="button" data-launch-edit="${escapeHtml(row.itemId || row.item?.id || '')}">
      <span class="launch-month-plan-day">${escapeHtml(dateLabel)}</span>
      <span class="launch-month-plan-title">
        <strong>${escapeHtml(title)}</strong>
        <em>${escapeHtml(meta)}</em>
      </span>
    </button>
  `;
}

function renderLaunchTimelineChart(rows = []) {
  const launchRows = rows.filter((row) => row.kind === 'Запуск');
  const controlRows = rows
    .filter((row) => row.kind !== 'Запуск' && row.days <= 45 && row.days >= -14)
    .slice(0, 6);
  const monthSet = new Set(launchTimelineDefaultMonths(3));
  launchRows
    .filter((row) => row.days <= 210 && row.days >= -45)
    .forEach((row) => {
      const key = launchTimelineMonthKey(row.date);
      if (key) monthSet.add(key);
    });
  const months = [...monthSet].sort().slice(0, 3);
  const byMonth = new Map(months.map((key) => [key, []]));
  launchRows.forEach((row) => {
    const key = launchTimelineMonthKey(row.date);
    if (byMonth.has(key)) byMonth.get(key).push(row);
  });

  return `
    <div class="launch-human-graph" aria-label="План запусков по месяцам">
      <div class="launch-graph-legend">
        <span><i class="ok"></i> можно запускать</span>
        <span><i class="warn"></i> близко / нужен контроль</span>
        <span><i class="danger"></i> просрочено</span>
      </div>
      <div class="launch-month-plan-grid">
        ${months.map((monthKey) => {
          const monthRows = (byMonth.get(monthKey) || []).sort((left, right) => {
            const bucketDelta = launchTimelineBucket(left).rank - launchTimelineBucket(right).rank;
            return bucketDelta || left.date.localeCompare(right.date) || launchDirectorPriority(right.item || {}) - launchDirectorPriority(left.item || {});
          });
          const buckets = launchTimelineMonthBuckets(monthRows);
          const visible = monthRows.slice(0, 3);
          const hiddenRows = monthRows.slice(3, 11);
          const extraHidden = Math.max(0, monthRows.length - visible.length - hiddenRows.length);
          const tone = launchTimelineMonthTone(monthRows);
          const ready = monthRows.filter((row) => launchTimelineTone(row) === 'ok').length;
          return `
            <div class="launch-month-plan-card ${escapeHtml(tone)}">
              <div class="launch-month-plan-head">
                <div>
                  <strong>${escapeHtml(launchTimelineMonthLabel(monthKey))}</strong>
                  <span>${monthRows.length ? `${fmt.int(monthRows.length)} запусков` : 'пока пусто'}</span>
                </div>
                ${monthRows.length ? badge(`${fmt.int(ready)} готово`, ready === monthRows.length ? 'ok' : 'warn') : badge('план', '')}
              </div>
              ${monthRows.length ? `
                <div class="launch-month-plan-buckets">
                  ${buckets.map((bucket) => `
                    <span class="launch-month-plan-bucket ${escapeHtml(bucket.tone)}">
                      <strong>${fmt.int(bucket.count)}</strong>
                      <em>${escapeHtml(bucket.label)}</em>
                    </span>
                  `).join('')}
                </div>
                <div class="launch-month-plan-products">
                  ${visible.map(renderLaunchTimelineProductRow).join('')}
                </div>
                ${hiddenRows.length ? `
                  <details class="launch-month-plan-detail">
                    <summary>Показать еще ${fmt.int(hiddenRows.length + extraHidden)} товаров</summary>
                    <div class="launch-month-plan-products">
                      ${hiddenRows.map(renderLaunchTimelineProductRow).join('')}
                      ${extraHidden ? `<div class="launch-month-plan-more">+${fmt.int(extraHidden)} товаров ниже в полном списке</div>` : ''}
                    </div>
                  </details>
                ` : ''}
              ` : '<div class="launch-month-plan-empty">Нет запусков в этом месяце</div>'}
            </div>
          `;
        }).join('')}
      </div>
      <div class="launch-checkpoint-strip">
        <div class="launch-checkpoint-head">
          <strong>Ближайшие контрольные точки</strong>
          <span class="muted small">Этапы и задачи, которые двигают товары к запуску</span>
        </div>
        <div class="launch-checkpoint-list">
          ${controlRows.map((row) => {
            const tone = launchTimelineTone(row);
            const timing = row.days < 0 ? `просрочено ${fmt.int(Math.abs(row.days))} дн.` : row.days === 0 ? 'сегодня' : `через ${fmt.int(row.days)} дн.`;
            return `
              <button class="launch-checkpoint-item ${escapeHtml(tone)}" type="button" data-launch-edit="${escapeHtml(row.itemId || row.item?.id || '')}">
                <span>${escapeHtml(row.date)}</span>
                <strong>${escapeHtml(row.label || row.kind)}</strong>
                <em>${escapeHtml(row.item?.name || 'Новинка')} · ${escapeHtml(timing)}</em>
              </button>
            `;
          }).join('') || '<div class="empty">Ближайших контрольных точек нет.</div>'}
        </div>
      </div>
    </div>
  `;
}

function renderLaunchAutoGraph(items = []) {
  const rows = launchAutoGraphRows(items);
  const visibleRows = rows.filter((row) => row.days <= 120).slice(0, 18);
  const overdue = rows.filter((row) => row.days < 0).length;
  const fromTasks = rows.filter((row) => row.kind === 'Задача').length;
  const launchRows = rows.filter((row) => row.kind === 'Запуск');
  return `
    <div class="card launch-auto-graph-card">
      <div class="section-subhead">
        <div>
          <h3>План запусков по месяцам</h3>
          <p class="small muted">Сверху показываем только сами запуски по месяцам. Этапы и задачи остаются ниже как контрольные точки, чтобы график не превращался в шум.</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(launchRows.length)} запусков`, launchRows.length ? 'info' : 'warn')}
          ${badge(`${fmt.int(fromTasks)} задач`, fromTasks ? 'ok' : 'warn')}
          ${overdue ? badge(`${fmt.int(overdue)} просрочено`, 'danger') : badge('просрочки нет', 'ok')}
        </div>
      </div>
      ${renderLaunchTimelineChart(rows)}
      <details class="launch-auto-details">
        <summary>Показать все ближайшие точки</summary>
      <div class="launch-auto-graph">
        ${visibleRows.map((row) => {
          const tone = row.days < 0 ? 'danger' : row.days <= 7 ? 'warn' : row.kind === 'Запуск' ? 'ok' : 'info';
          const timing = row.days < 0 ? `-${fmt.int(Math.abs(row.days))} дн.` : row.days === 0 ? 'сегодня' : `+${fmt.int(row.days)} дн.`;
          return `
            <div class="launch-auto-row ${tone}">
              <div class="launch-auto-date">
                <strong>${escapeHtml(row.date)}</strong>
                <span>${escapeHtml(timing)}</span>
              </div>
              <div class="launch-auto-main">
                <strong>${row.item.articleKey ? linkToSku(row.item.articleKey, row.item.name || row.item.articleKey) : escapeHtml(row.item.name || 'Новинка')}</strong>
                <span>${escapeHtml(row.kind)} · ${escapeHtml(row.label)} · ${escapeHtml(row.source)}</span>
                <em>${escapeHtml(row.action || 'Следующий шаг не указан')}</em>
              </div>
              <div class="launch-auto-side">
                ${badge(row.status || 'без статуса', tone)}
                ${row.owner ? badge(row.owner, 'info') : badge('без owner', 'warn')}
              </div>
            </div>
          `;
        }).join('') || '<div class="empty">Сроков по текущему фильтру пока нет. Добавьте срок этапа или задачу запуска.</div>'}
      </div>
      </details>
    </div>
  `;
}

function renderLaunchMonthFilters(model) {
  const sourceLabel = model.sourceFiles[0] || 'Портальные черновики';
  return `
    <div class="card launch-filter-shell launch-filter-lite">
      <div class="section-subhead">
        <div>
          <h3>Отбор новинок</h3>
          <p class="small muted">Обычно хватает поиска, месяца, owner и готовности. Остальные фильтры спрятаны ниже.</p>
        </div>
        <div class="badge-stack">
          ${badge(sourceLabel, 'info')}
          ${badge(`${fmt.int(model.filteredItems.length)} в отборе`, model.filteredItems.length ? 'info' : 'warn')}
        </div>
      </div>
      <div class="control-filters launch-filter-grid launch-filter-main">
        <input id="launchSearchInput" placeholder="Поиск: новинка, SKU, owner..." value="${escapeHtml(model.filters.search)}">
        <select id="launchMonthFilter">
          <option value="all">Все месяцы</option>
          ${model.months.map((item) => `<option value="${escapeHtml(item.label)}" ${model.filters.month === item.label ? 'selected' : ''}>${escapeHtml(item.label)} · ${fmt.int(item.count)}</option>`).join('')}
        </select>
        <select id="launchOwnerFilter">
          <option value="all">Все owner</option>
          ${model.owners.map((item) => `<option value="${escapeHtml(item)}" ${model.filters.owner === item ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}
        </select>
        <select id="launchReadinessFilter">
          <option value="all">Все статусы готовности</option>
          <option value="blocked" ${model.filters.readiness === 'blocked' ? 'selected' : ''}>Нужно заполнить</option>
          <option value="ready" ${model.filters.readiness === 'ready' ? 'selected' : ''}>Готово к запуску</option>
          <option value="no-owner" ${model.filters.readiness === 'no-owner' ? 'selected' : ''}>Без owner</option>
          <option value="no-sku" ${model.filters.readiness === 'no-sku' ? 'selected' : ''}>Без SKU</option>
          <option value="no-presentation" ${model.filters.readiness === 'no-presentation' ? 'selected' : ''}>Без материалов</option>
          <option value="no-gantt" ${model.filters.readiness === 'no-gantt' ? 'selected' : ''}>Без календаря</option>
        </select>
      </div>
      <details class="launch-filters-more">
        <summary>Ещё фильтры</summary>
        <div class="control-filters launch-filter-grid">
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
          <select id="launchTaskFilter">
            <option value="all">Все задачи</option>
            <option value="with" ${model.filters.tasks === 'with' ? 'selected' : ''}>Есть задачи</option>
            <option value="without" ${model.filters.tasks === 'without' ? 'selected' : ''}>Без задач</option>
          </select>
        </div>
        <div class="quick-actions launch-focus-rail">
          <button class="${launchFocusChipClass(model.filters.readiness === 'no-owner')}" type="button" data-launch-preset="no-owner">Без owner · ${fmt.int(model.fullSummary.total - model.fullSummary.withOwner)}</button>
          <button class="${launchFocusChipClass(model.filters.readiness === 'no-sku')}" type="button" data-launch-preset="no-sku">Без SKU · ${fmt.int(model.fullSummary.total - model.fullSummary.linkedSku)}</button>
          <button class="${launchFocusChipClass(model.filters.readiness === 'no-presentation')}" type="button" data-launch-preset="no-presentation">Без материалов · ${fmt.int(model.fullSummary.total - model.fullSummary.withPresentation)}</button>
          <button class="${launchFocusChipClass(model.filters.readiness === 'blocked')}" type="button" data-launch-preset="blocked">С блокерами · ${fmt.int(model.fullSummary.blocked)}</button>
          <button class="${launchFocusChipClass(model.filters.tasks === 'without')}" type="button" data-launch-preset="without-tasks">Без задач · ${fmt.int(model.fullSummary.total - model.fullSummary.withTasks)}</button>
        </div>
      </details>
      <div class="quick-actions launch-primary-actions">
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
      downloadLaunchesExcel(model.filteredItems, button.getAttribute('data-launch-export') || 'launches');
    });
  });
  root.querySelectorAll('[data-launch-download-form]').forEach((button) => {
    button.addEventListener('click', () => {
      downloadLaunchWorkbookTemplate(model.filteredItems.length ? model.filteredItems : model.items);
    });
  });
  root.querySelectorAll('[data-launch-import]').forEach((button) => {
    button.addEventListener('click', () => {
      root.querySelector('#launchWorkbookImport')?.click();
    });
  });
  root.querySelectorAll('[data-launch-show-gantt]').forEach((button) => {
    button.addEventListener('click', () => {
      setLaunchGanttExpanded(true);
      rerenderCurrentView();
      window.requestAnimationFrame(() => {
        document.querySelector('[data-launch-gantt-fold]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  });
  root.querySelector('#launchWorkbookImport')?.addEventListener('change', (event) => {
    importLaunchWorkbookFile(event.target.files?.[0]);
    event.target.value = '';
  });
  root.querySelectorAll('[data-launch-add]').forEach((button) => {
    button.addEventListener('click', () => openLaunchEditor());
  });
  root.querySelectorAll('[data-launch-reset]').forEach((button) => {
    button.addEventListener('click', () => {
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
        ganttExpanded: false,
        monthsExpanded: false
      };
      rerenderCurrentView();
    });
  });
}

function launchGanttExpanded() {
  const filters = getLaunchFilters();
  if (typeof filters.ganttExpanded !== 'boolean') filters.ganttExpanded = false;
  return filters.ganttExpanded;
}

function bindLaunchGanttFold(root) {
  const panel = root.querySelector('[data-launch-gantt-fold]');
  if (!panel) return;
  panel.addEventListener('toggle', () => {
    setLaunchGanttExpanded(panel.open);
    rerenderCurrentView();
  });
}

function launchMonthsExpanded() {
  const filters = getLaunchFilters();
  if (typeof filters.monthsExpanded !== 'boolean') filters.monthsExpanded = false;
  return filters.monthsExpanded;
}

function setLaunchMonthsExpanded(expanded) {
  getLaunchFilters().monthsExpanded = Boolean(expanded);
}

function bindLaunchMonthsFold(root) {
  const panel = root.querySelector('[data-launch-months-fold]');
  if (!panel) return;
  panel.addEventListener('toggle', () => {
    setLaunchMonthsExpanded(panel.open);
    rerenderCurrentView();
  });
}

function openLaunchEditor(launchId = '', defaults = {}) {
  const currentItem = getLaunchEditorItem(launchId, defaults);
  const revenuePlan = normalizeLaunchPlanList(currentItem.monthlyRevenuePlan, launchPortalMonthPlanLabels(currentItem.launchMonth));
  const launchPlan = normalizeLaunchPlanList(currentItem.monthlyLaunchPlan, revenuePlan.map((entry) => entry.label));
  const ganttColumns = launchEditorMonthColumns(currentItem);
  const activeGantt = new Set((currentItem.ganttMonths || []).map((entry) => entry.monthKey));
  const owners = ownerOptions();
  const skuOptions = launchEditorSkuOptions(currentItem);
  const skuSuggestions = currentItem.skuSuggestions && currentItem.skuSuggestions.length ? currentItem.skuSuggestions : getLaunchSkuSuggestions(currentItem, 3);
  const linkedSku = currentItem.articleKey ? getSku(currentItem.articleKey) : null;
  const modal = ensureLaunchEditorModal();
  const body = document.getElementById('launchEditorModalBody');
  body.innerHTML = `
    <div class="modal-head">
      <div>
        <div class="muted small">${escapeHtml(currentItem.reportGroup || 'Продукт')} · ${escapeHtml(currentItem.launchMonth || 'Без месяца')}</div>
        <h2>${escapeHtml(currentItem.name || 'Новая новинка')}</h2>
        <div class="badge-stack">${currentItem.owner ? badge(currentItem.owner, 'info') : badge('Без owner', 'warn')}${badge(currentItem.status || 'Черновик', 'info')}${currentItem.launchDecision ? badge(currentItem.launchDecision, launchFinalDecisionApproved(currentItem) ? 'ok' : 'warn') : ''}</div>
      </div>
      <button class="btn ghost" type="button" data-close-launch-editor>Закрыть</button>
    </div>

    <datalist id="launchEditorOwnerList">${owners.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('')}</datalist>
    <datalist id="launchEditorSkuList">${skuOptions.map((entry) => `<option value="${escapeHtml(entry.articleKey)}">${escapeHtml(launchSkuSuggestionLabel(entry))}</option>`).join('')}</datalist>

    <form id="launchEditorForm" class="form-grid compact launch-editor-lite-form">
      <input type="hidden" name="id" value="${escapeHtml(currentItem.id)}">

      ${renderLaunchNowPanel(currentItem)}
      <details class="launch-editor-fold">
        <summary>
          <span>Готовность к запуску</span>
          ${badge(`${fmt.int(launchReadinessState(currentItem).checks.length - launchReadinessState(currentItem).missing.length)} / ${fmt.int(launchReadinessState(currentItem).checks.length)}`, launchReadinessState(currentItem).ready ? 'ok' : 'warn')}
        </summary>
        ${renderLaunchReadinessPanel(currentItem)}
      </details>

      <div class="launch-editor-panel launch-editor-section">
        <div class="section-subhead">
          <div>
            <h3>Карточка товара</h3>
            <p class="small muted">Минимум для заведения: название, группа, месяц, статус и ответственный.</p>
          </div>
          ${badge(currentItem.status || 'Черновик', 'info')}
        </div>
        ${renderLaunchTemplateBar(currentItem)}
        <div class="launch-editor-grid">
          <label class="span-2"><span class="muted small">Название товара</span><input name="name" value="${escapeHtml(currentItem.name || '')}" placeholder="Например: крем с ретинолом 50 мл" required></label>
          <label><span class="muted small">Группа</span><input name="reportGroup" value="${escapeHtml(currentItem.reportGroup || 'Продукт')}" required></label>
          <label><span class="muted small">Тип продукта</span><select name="productType">${launchProductTypeOptionsHtml(currentItem.productType)}</select></label>
          <label><span class="muted small">Месяц запуска</span><input name="launchMonth" value="${escapeHtml(currentItem.launchMonth || '')}" required></label>
          <label><span class="muted small">Точная дата</span><input name="launchDate" type="date" value="${escapeHtml(currentItem.launchDate || '')}"></label>
          <label><span class="muted small">Статус карточки</span><select name="status">${launchStatusOptionsHtml(currentItem.status)}</select></label>
          <label><span class="muted small">Owner внутри команды</span><input name="owner" list="launchEditorOwnerList" value="${escapeHtml(currentItem.owner || '')}" placeholder="Кто ведет запуск"></label>
          <label><span class="muted small">Версия продукта</span><input name="productVersion" value="${escapeHtml(currentItem.productVersion || 'v1')}" placeholder="v1, v2, relaunch"></label>
          <label class="span-2"><span class="muted small">Что изменилось в версии</span><input name="versionReason" value="${escapeHtml(currentItem.versionReason || '')}" placeholder="новая упаковка, формула, поставщик, цена"></label>
          <label><span class="muted small">Решение по запуску</span><select name="launchDecision">${launchDecisionOptionsHtml(currentItem.launchDecision)}</select></label>
          <label class="span-2"><span class="muted small">Причина решения</span><input name="launchDecisionReason" value="${escapeHtml(currentItem.launchDecisionReason || '')}" placeholder="почему запускаем / что держит на паузе"></label>
        </div>
      </div>

      <details class="launch-editor-detail-pack" open>
        <summary>
          <span>Подробно: поставщик, этапы, SKU и комментарии</span>
          ${badge('этапы открыты', 'info')}
        </summary>

      <div class="launch-editor-panel launch-editor-section">
        <div class="section-subhead">
          <div>
            <h3>Поставщик и переговоры</h3>
            <p class="small muted">Здесь хранится рабочая история по заводу, условиям, образцам и следующему шагу.</p>
          </div>
          ${currentItem.negotiationStatus ? badge(currentItem.negotiationStatus, 'warn') : badge('переговоры не заполнены', 'warn')}
        </div>
        <div class="launch-editor-grid">
          <label><span class="muted small">Поставщик</span><input name="supplierName" value="${escapeHtml(currentItem.supplierName || '')}" placeholder="Юрлицо / менеджер / бренд"></label>
          <label><span class="muted small">Завод / производство</span><input name="factoryName" value="${escapeHtml(currentItem.factoryName || '')}" placeholder="Где производится"></label>
          <label><span class="muted small">Контакт поставщика</span><input name="supplierContact" value="${escapeHtml(currentItem.supplierContact || '')}" placeholder="имя, телефон, почта, Telegram"></label>
          <label class="span-all"><span class="muted small">Производство / условия</span><input name="production" value="${escapeHtml(currentItem.production || '')}" placeholder="MOQ, срок, образцы, упаковка, ограничения"></label>
        </div>
      </div>

      <div class="launch-editor-panel launch-editor-section">
        <div class="section-subhead">
          <div>
            <h3>Доска этапов</h3>
            <p class="small muted">Каждый этап — рабочая задача внутри товара. Перетащите карточку в нужную колонку или используйте кнопки внутри карточки.</p>
          </div>
          ${badge('канбан внутри продукта', 'info')}
        </div>
        ${renderLaunchStageTaskBoard(currentItem)}
      </div>

      <div class="launch-editor-panel launch-editor-section">
        <div class="section-subhead">
          <div>
            <h3>SKU и площадки</h3>
            <p class="small muted">Если SKU уже есть в реестре, выберите article_key и подтяните карточку. Если нет, можно сохранить как черновик.</p>
          </div>
          <div class="badge-stack">
            ${currentItem.articleKey ? badge(currentItem.articleKey, 'ok') : badge('SKU пока не связан', 'warn')}
            ${linkedSku ? badge(linkedSku.article || linkedSku.articleKey, 'info') : ''}
          </div>
        </div>
        <div class="launch-editor-grid">
          <label><span class="muted small">article_key</span><input name="articleKey" list="launchEditorSkuList" value="${escapeHtml(currentItem.articleKey || '')}" placeholder="telomeras_60caps"></label>
          <label><span class="muted small">Артикул</span><input name="article" value="${escapeHtml(currentItem.article || '')}"></label>
          <label><span class="muted small">Статус в SKU</span><input name="registryStatus" value="${escapeHtml(currentItem.registryStatus || '')}"></label>
          <label><span class="muted small">Площадки</span><input name="marketplaces" value="${escapeHtml(currentItem.marketplaces || '')}" placeholder="WB, Ozon, Я.Маркет..."></label>
          <label class="span-2"><span class="muted small">Презентация / материалы</span><input name="presentationUrl" value="${escapeHtml(currentItem.presentationUrl || '')}" placeholder="https://..."></label>
        </div>
        <div class="quick-actions">
          <button class="btn ghost" type="button" data-launch-editor-apply-sku>Подтянуть из SKU</button>
          ${currentItem.articleKey ? '<button class="btn ghost" type="button" data-launch-editor-open-sku>Открыть SKU</button>' : ''}
        </div>
        ${skuSuggestions.length ? `
          <div class="launch-editor-suggestion-row">
            ${skuSuggestions.map((entry) => `
              <button class="quick-chip" type="button" data-launch-sku-suggest="${escapeHtml(entry.articleKey)}">${escapeHtml(launchSkuSuggestionLabel(entry))}</button>
            `).join('')}
          </div>
        ` : ''}
      </div>

      <div class="launch-editor-panel launch-editor-section">
        <div class="section-subhead">
          <div>
            <h3>Решения и комментарии</h3>
            <p class="small muted">Решения — фиксируем как итог переговоров. Комментарии — живой рабочий контекст по продукту.</p>
          </div>
          ${badge((currentItem.decisionLog || currentItem.productComment || currentItem.notes) ? 'есть история' : 'пусто', (currentItem.decisionLog || currentItem.productComment || currentItem.notes) ? 'ok' : 'warn')}
        </div>
        <div class="launch-editor-grid">
          <label><span class="muted small">Подкатегория</span><input name="subCategory" value="${escapeHtml(currentItem.subCategory || '')}"></label>
          <label><span class="muted small">Категория</span><input name="category" value="${escapeHtml(currentItem.category || '')}"></label>
          <label><span class="muted small">Тег</span><input name="tag" value="${escapeHtml(currentItem.tag || '')}"></label>
          <label><span class="muted small">SKU bucket</span><input name="skuBucket" value="${escapeHtml(currentItem.skuBucket || '')}"></label>
          <label class="span-all"><span class="muted small">Характеристика / УТП</span><textarea name="characteristic" rows="3" placeholder="Что это за продукт, чем отличается, кому нужен">${escapeHtml(currentItem.characteristic || '')}</textarea></label>
          <label class="span-all"><span class="muted small">Журнал решений</span><textarea name="decisionLog" rows="4" placeholder="Дата / кто / что решили / что больше не обсуждаем">${escapeHtml(currentItem.decisionLog || '')}</textarea></label>
          <label class="span-all"><span class="muted small">Рабочие комментарии по продукту</span><textarea name="productComment" rows="3" placeholder="Гипотезы, риски, обещания, что проверить">${escapeHtml(currentItem.productComment || '')}</textarea></label>
          <label class="span-all"><span class="muted small">Внутренние заметки</span><textarea name="notes" rows="3" placeholder="Любой рабочий контекст, который должен остаться в карточке">${escapeHtml(currentItem.notes || '')}</textarea></label>
        </div>
      </div>

      </details>

      <details class="launch-editor-advanced">
        <summary>Экономика, план и календарь</summary>
        <div class="form-grid compact">
          <label><span class="muted small">Целевая себестоимость</span><input name="targetCost" value="${escapeHtml(currentItem.targetCost ?? '')}"></label>
          <label><span class="muted small">СРЦ без НДС</span><input name="srcWithoutVat" value="${escapeHtml(currentItem.srcWithoutVat ?? '')}"></label>
          <label><span class="muted small">СРЦ с НДС</span><input name="srcWithVat" value="${escapeHtml(currentItem.srcWithVat ?? '')}"></label>
          <label><span class="muted small">СРЦ со СПП 28</span><input name="srcWithSpp28" value="${escapeHtml(currentItem.srcWithSpp28 ?? '')}"></label>
          <label><span class="muted small">Δ МРЦ</span><input name="mrpDeltaPct" value="${escapeHtml(currentItem.mrpDeltaPct ?? '')}"></label>
          <label><span class="muted small">РРЦ с НДС</span><input name="rrpWithVat" value="${escapeHtml(currentItem.rrpWithVat ?? '')}"></label>
          <label><span class="muted small">МРЦ с НДС</span><input name="mrpWithVat" value="${escapeHtml(currentItem.mrpWithVat ?? '')}"></label>
          <label><span class="muted small">Маржа %</span><input name="grossMarginPct" value="${escapeHtml(currentItem.grossMarginPct ?? '')}"></label>
          <label><span class="muted small">Маржа ₽</span><input name="grossMarginRub" value="${escapeHtml(currentItem.grossMarginRub ?? '')}"></label>
          <label><span class="muted small">Якорная выручка</span><input name="revenueAnchor" value="${escapeHtml(currentItem.revenueAnchor ?? '')}"></label>
          <label><span class="muted small">План за год</span><input name="yearlyPlanValue" value="${escapeHtml(currentItem.yearlyPlanValue ?? '')}"></label>
        </div>
        <div class="launch-plan-grid">
          <div>
            <h3>План выручки</h3>
            <div class="control-filters">${revenuePlan.map((entry, index) => `
              <label><span class="muted small">${escapeHtml(entry.label)}</span><input name="revenuePlan__${index}" value="${escapeHtml(entry.value ?? '')}"></label>
            `).join('')}</div>
          </div>
          <div>
            <h3>План запуска</h3>
            <div class="control-filters">${launchPlan.map((entry, index) => `
              <label><span class="muted small">${escapeHtml(entry.label)}</span><input name="launchPlan__${index}" value="${escapeHtml(entry.value ?? '')}"></label>
            `).join('')}</div>
          </div>
        </div>
        <div class="launch-gantt-picker">
          <h3>Календарь запуска</h3>
          <div class="control-filters">${ganttColumns.map((column) => `
            <label class="chip ${activeGantt.has(column.monthKey) ? 'info' : ''}">
              <input type="checkbox" name="gantt__${column.monthKey}" ${activeGantt.has(column.monthKey) ? 'checked' : ''}>
              <span>${escapeHtml(`${column.label} ${column.year}`)}</span>
            </label>
          `).join('')}</div>
        </div>
      </details>

      <div class="quick-actions launch-editor-actions">
        <button class="btn ghost" type="button" data-launch-editor-task>Поставить задачу</button>
        <button class="btn ghost" type="button" data-launch-editor-next-task>Создать ближайшую задачу</button>
        <button class="btn ghost" type="button" data-launch-editor-stage-tasks>Все задачи по этапам</button>
        <button class="btn ghost" type="button" data-launch-editor-delete>Убрать из портала</button>
        <button class="btn ghost" type="button" data-close-launch-editor>Закрыть</button>
        <button class="btn primary" type="submit">Сохранить карточку</button>
      </div>
    </form>
  `;

  modal.classList.add('open');

  body.querySelectorAll('[data-close-launch-editor]').forEach((button) => {
    button.addEventListener('click', closeLaunchEditor);
  });
  bindLaunchStageTaskBoard(body);
  const form = body.querySelector('#launchEditorForm');
  body.querySelectorAll('[data-launch-template]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!applyLaunchTemplateToForm(form, button.getAttribute('data-launch-template') || '')) {
        window.alert('Не удалось применить шаблон этапов.');
      }
    });
  });
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
  body.querySelector('[data-launch-editor-next-task]')?.addEventListener('click', async () => {
    const draft = readLaunchEditorForm(form, currentItem, revenuePlan, launchPlan, ganttColumns);
    upsertLaunchDraft(draft);
    const result = await createLaunchNextStageTask(normalizeLaunchItem(draft, { skipTaskLookup: true }));
    closeLaunchEditor();
    rerenderCurrentView();
    window.alert(`Ближайшая задача: создано ${result.created}, пропущено ${result.skipped}.`);
  });
  body.querySelector('[data-launch-editor-stage-tasks]')?.addEventListener('click', async () => {
    const draft = readLaunchEditorForm(form, currentItem, revenuePlan, launchPlan, ganttColumns);
    upsertLaunchDraft(draft);
    const result = await createLaunchStageTasks(normalizeLaunchItem(draft, { skipTaskLookup: true }));
    closeLaunchEditor();
    rerenderCurrentView();
    window.alert(`Задачи по этапам: создано ${result.created}, пропущено ${result.skipped}.`);
  });
}

const LAUNCH_PROJECT_COLUMN_ORDER = ['owner', 'supply', 'content', 'economy', 'scale'];
const LAUNCH_PROJECT_STATUS_LABELS = {
  owner: 'Подготовка',
  supply: 'Поставка',
  content: 'Контент',
  economy: 'Экономика',
  scale: 'Запуск'
};

function launchProjectColumnItems(items = [], columnKey = '') {
  return (items || [])
    .filter((item) => (item.phase || 'content') === columnKey)
    .sort((left, right) => {
      return launchDirectorPriority(right) - launchDirectorPriority(left)
        || launchMonthSortValue(left.launchMonth) - launchMonthSortValue(right.launchMonth)
        || String(left.name || '').localeCompare(String(right.name || ''), 'ru');
    });
}

function renderLaunchProjectCard(item = {}) {
  const stage = launchCurrentStageEntry(item) || {};
  const dueLabel = launchDueDateLabel(item);
  const taskCount = numberOrZero(item.activeTasks);
  const stageLabel = stage.config?.title || launchDirectorNextAction(item);
  return `
    <div class="launch-project-card ${launchIsReady(item) ? 'is-ready' : (item.blockers || []).length ? 'has-risk' : ''}">
      <div class="launch-project-card__head">
        <div>
          <strong>${item.articleKey ? linkToSku(item.articleKey, item.name || item.articleKey) : escapeHtml(item.name || 'Новая новинка')}</strong>
          <span>${escapeHtml(dueLabel)} · ${escapeHtml(stageLabel)}</span>
        </div>
        ${item.articleKey ? badge(item.articleKey, item.articleMatched ? 'ok' : 'warn') : ''}
      </div>
      <div class="launch-project-card__foot">
        <span>${escapeHtml(stage.status || stage.column?.label || item.status || 'не начато')}</span>
        ${taskCount ? `<span>${fmt.int(taskCount)} задач</span>` : ''}
      </div>
      <div class="quick-actions launch-project-card__actions">
        <button class="quick-chip portal-action-primary" type="button" data-launch-edit="${escapeHtml(item.id)}">Папка</button>
      </div>
    </div>
  `;
}

function renderLaunchProjectBoard(items = []) {
  const total = (items || []).length;
  return `
    <div class="card launch-project-board-card">
      <div class="section-subhead">
        <div>
          <h3>Статусы запуска</h3>
        </div>
        ${badge(`${fmt.int(total)} новинок`, total ? 'info' : 'warn')}
      </div>
      <div class="launch-project-board">
        ${LAUNCH_PROJECT_COLUMN_ORDER.map((columnKey) => {
          const meta = launchPhaseMeta(columnKey);
          const label = LAUNCH_PROJECT_STATUS_LABELS[columnKey] || meta.label;
          const columnItems = launchProjectColumnItems(items, columnKey);
          const visibleItems = columnItems.slice(0, 4);
          const hiddenItems = columnItems.slice(4);
          return `
            <section class="launch-project-column launch-project-column-${escapeHtml(meta.tone || 'neutral')}">
              <div class="launch-project-column__head">
                <div>
                  <strong>${escapeHtml(label)}</strong>
                  <span>${fmt.int(columnItems.length)} товаров</span>
                </div>
              </div>
              <div class="launch-project-column__list">
                ${visibleItems.map(renderLaunchProjectCard).join('') || '<div class="launch-project-empty">Нет товаров</div>'}
              </div>
              ${hiddenItems.length ? `<button class="launch-project-more-button" type="button" data-launch-stage-filter="${escapeHtml(columnKey)}">Еще ${fmt.int(hiddenItems.length)}</button>` : ''}
            </section>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function bindLaunchProjectActions(root) {
  bindLaunchItemActions(root);
  const findLaunch = (launchId) => getLaunchItems({ skipTaskLookup: true }).find((entry) => entry.id === launchId);
  root.querySelectorAll('[data-launch-stage-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      getLaunchFilters().phase = button.getAttribute('data-launch-stage-filter') || 'all';
      rerenderCurrentView();
    });
  });
  root.querySelectorAll('[data-launch-next-task]').forEach((button) => {
    button.addEventListener('click', async () => {
      const item = findLaunch(button.getAttribute('data-launch-next-task') || '');
      if (!item) return;
      const result = await createLaunchNextStageTask(item);
      rerenderCurrentView();
      window.alert(`Ближайшая задача: создано ${result.created}, пропущено ${result.skipped}.`);
    });
  });
  root.querySelectorAll('[data-launch-stage-tasks]').forEach((button) => {
    button.addEventListener('click', async () => {
      const item = findLaunch(button.getAttribute('data-launch-stage-tasks') || '');
      if (!item) return;
      const result = await createLaunchStageTasks(item);
      rerenderCurrentView();
      window.alert(`Задачи по этапам: создано ${result.created}, пропущено ${result.skipped}.`);
    });
  });
}

const LAUNCH_CALENDAR_WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function launchCalendarState() {
  state.launchCalendar = state.launchCalendar || {};
  const view = state.launchCalendar;
  view.month = launchCalendarValidDateKey(view.month) ? launchCalendarStartOfMonth(view.month) : '';
  view.search = String(view.search || '');
  view.group = view.group || 'all';
  view.status = view.status || 'all';
  view.statusTheme = view.statusTheme || 'all';
  view.focus = view.focus || 'all';
  return view;
}

function launchCalendarValidDateKey(value = '') {
  const key = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return '';
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : key;
}

function launchCalendarDateFromKey(key = '') {
  const valid = launchCalendarValidDateKey(key) || todayIso();
  const date = new Date(`${valid}T00:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function launchCalendarDateKey(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return todayIso();
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0')
  ].join('-');
}

function launchCalendarStartOfMonth(key = '') {
  const valid = launchCalendarValidDateKey(key) || todayIso();
  return `${valid.slice(0, 7)}-01`;
}

function launchCalendarAddMonths(monthKey = '', delta = 0) {
  const date = launchCalendarDateFromKey(launchCalendarStartOfMonth(monthKey));
  date.setMonth(date.getMonth() + Number(delta || 0));
  return launchCalendarStartOfMonth(launchCalendarDateKey(date));
}

function launchCalendarMonthDays(monthKey = '') {
  const first = launchCalendarDateFromKey(launchCalendarStartOfMonth(monthKey));
  const start = new Date(first);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return launchCalendarDateKey(date);
  });
}

function launchCalendarMonthLabel(monthKey = '') {
  return launchCalendarDateFromKey(monthKey).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

function launchCalendarShortDateLabel(dateKey = '') {
  return launchCalendarDateFromKey(dateKey).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function launchCalendarDefaultMonth(items = []) {
  const today = todayIso();
  const dates = (items || [])
    .map((item) => launchCalendarValidDateKey(launchDueDateKey(item)))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  return launchCalendarStartOfMonth(dates.find((date) => date >= today) || dates[0] || today);
}

function launchCalendarUniqueOptions(items = [], getter = () => '') {
  return [...new Set((items || []).map(getter).map((value) => String(value || '').trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'ru'));
}

function launchCalendarRiskState(item = {}) {
  const days = launchDaysUntil(item);
  const blockers = Array.isArray(item.blockers) ? item.blockers.filter(Boolean) : [];
  const overdue = Number.isFinite(days) && days < 0;
  const dueSoon = Number.isFinite(days) && days >= 0 && days <= 14;
  const staleStage = launchStageEntries(item).some((entry) => entry.stale);
  const risk = overdue || staleStage || blockers.length > 0 || dueSoon;
  if (overdue) return { risk, tone: 'danger', label: `просрочено ${Math.abs(days)} дн.` };
  if (staleStage) return { risk, tone: 'danger', label: 'этап завис' };
  if (blockers.length) return { risk, tone: 'warn', label: blockers[0] };
  if (dueSoon) return { risk, tone: 'warn', label: `${days} дн. до запуска` };
  return { risk: false, tone: 'ok', label: 'в норме' };
}

function launchCalendarShortActionLabel(text = '') {
  const value = String(text || '').trim();
  const lower = value.toLowerCase().replace(/ё/g, 'е');
  if (!value) return 'описать шаг';
  if (/owner|ответствен/.test(lower)) return 'owner';
  if (/поставщик|завод|производ/.test(lower)) return 'поставщик';
  if (/переговор/.test(lower)) return 'переговоры';
  if (/образец|пробн/.test(lower)) return 'образец';
  if (/упаков|документ|макет/.test(lower)) return 'упаковка';
  if (/sku|реестр/.test(lower)) return 'SKU';
  if (/контент|карточ/.test(lower)) return 'контент';
  if (/площад/.test(lower)) return 'площадки';
  if (/презентац|фото|тз/.test(lower)) return 'материалы';
  if (/календар|план/.test(lower)) return 'план запуска';
  if (/задач/.test(lower)) return 'задача';
  if (/решени/.test(lower)) return 'решение';
  if (/финальн|готов/.test(lower)) return 'готово';
  return value.split(/\s+/).slice(0, 2).join(' ');
}

function launchCalendarActionChip(item = {}) {
  const risk = launchCalendarRiskState(item);
  if (risk.risk && risk.tone === 'danger') return { label: risk.label, tone: 'danger', full: risk.label };
  if (risk.risk && risk.label) return { label: launchCalendarShortActionLabel(risk.label), tone: 'warn', full: risk.label };
  const nextAction = launchDirectorNextAction(item);
  const ready = launchIsReady(item);
  return {
    label: ready ? 'вести факт' : launchCalendarShortActionLabel(nextAction),
    tone: ready ? 'ok' : 'info',
    full: nextAction
  };
}

function launchCalendarFilteredItems(items = [], options = {}) {
  const view = launchCalendarState();
  const search = String(view.search || '').trim().toLowerCase();
  const applyFocus = options.applyFocus !== false;
  return (items || []).filter((item) => {
    if (view.group !== 'all' && String(item.reportGroup || '') !== view.group) return false;
    if (view.status !== 'all' && String(item.status || '') !== view.status) return false;
    if (view.statusTheme !== 'all' && launchStatusTheme(item.status).key !== view.statusTheme) return false;
    if (applyFocus && view.focus === 'risk' && !launchCalendarRiskState(item).risk) return false;
    if (!search) return true;
    const haystack = [
      item.name,
      item.articleKey,
      item.article,
      item.reportGroup,
      item.status,
      item.launchDecision,
      item.marketplaces,
      item.productComment,
      item.notes,
      launchDirectorNextAction(item),
      ...(Array.isArray(item.blockers) ? item.blockers : [])
    ].join(' ').toLowerCase();
    return haystack.includes(search);
  });
}

function launchCalendarProgressScore(item = {}) {
  try {
    const readiness = launchReadinessState(item);
    const total = readiness.checks?.length || 0;
    if (!total) return 45;
    return Math.max(8, Math.min(100, Math.round(((total - (readiness.missing?.length || 0)) / total) * 100)));
  } catch (error) {
    return launchIsReady(item) ? 100 : 45;
  }
}

function launchCalendarMissionTone(item = {}) {
  const days = launchDaysUntil(item);
  if (Number.isFinite(days) && days < 0) return 'danger';
  if ((item.blockers || []).length || (Number.isFinite(days) && days <= 14)) return 'warn';
  return launchIsReady(item) ? 'ok' : 'warn';
}

function launchCalendarStageLabel(item = {}) {
  const stage = launchCurrentStageEntry(item);
  return stage?.config?.title || launchDirectorNextAction(item) || item.status || 'Запуск';
}

function renderLaunchCalendarPill(item = {}) {
  const progress = launchCalendarProgressScore(item);
  const tone = launchCalendarMissionTone(item);
  const statusTheme = launchStatusTheme(item.status);
  const action = launchCalendarActionChip(item);
  const meta = [
    item.articleKey || item.article || 'без SKU',
    launchCalendarStageLabel(item)
  ].filter(Boolean).join(' · ');
  return `
    <button class="promo-event-pill compact promo-kind-launch mission-${escapeHtml(tone)}" type="button" draggable="true" data-launch-calendar-event="${escapeHtml(item.id)}" data-launch-status-tone="${escapeHtml(statusTheme.key)}" style="--event-xp:${progress}%;${launchStatusInlineStyle(item.status)}" title="${escapeHtml(`${item.status || statusTheme.label} · ${action.full || action.label}`)}">
      <span class="promo-event-kind-badge">${escapeHtml(statusTheme.label)}</span>
      <strong>${escapeHtml(item.name || item.articleKey || 'Новая новинка')}</strong>
      <span class="launch-action-chip launch-action-${escapeHtml(action.tone)}">${escapeHtml(action.label)}</span>
      <em class="promo-event-meta">${escapeHtml(meta)}</em>
    </button>
  `;
}

function launchCalendarGameStats(monthItems = [], allItems = []) {
  const items = Array.isArray(monthItems) ? monthItems : [];
  const total = items.length;
  const ready = items.filter(launchIsReady).length;
  const risk = items.filter((item) => launchCalendarRiskState(item).risk).length;
  const active = Math.max(0, total - ready - risk);
  const score = total
    ? Math.round(items.reduce((sum, item) => sum + launchCalendarProgressScore(item), 0) / total)
    : 0;
  const label = score >= 82 ? 'режим запуска' : score >= 55 ? 'разгон' : total ? 'сборка' : 'нет миссий';
  const statusThemes = [...new Map((allItems || []).map((item) => {
    const theme = launchStatusTheme(item.status);
    return [theme.key, theme];
  })).values()];
  return { total, ready, risk, active, score, label, statusThemes };
}

function renderLaunchCalendarGame(monthItems = [], allItems = []) {
  const stats = launchCalendarGameStats(monthItems, allItems);
  const view = launchCalendarState();
  return `
    <section class="launch-calendar-game" style="--launch-game-score:${stats.score}%">
      <div class="launch-calendar-game__score">
        <span>Квест месяца</span>
        <strong>${fmt.int(stats.score)}</strong>
        <em>${escapeHtml(stats.label)}</em>
        <i aria-hidden="true"></i>
      </div>
      <div class="launch-calendar-game__stats">
        <button type="button" class="${view.focus === 'all' ? 'active' : ''}" data-launch-calendar-focus="all"><b>${fmt.int(stats.total)}</b><em>в месяце</em></button>
        <span><b>${fmt.int(stats.ready)}</b><em>готово</em></span>
        <span><b>${fmt.int(stats.active)}</b><em>в работе</em></span>
        <button type="button" class="${stats.risk ? 'is-risk' : ''} ${view.focus === 'risk' ? 'active' : ''}" data-launch-calendar-focus="risk"><b>${fmt.int(stats.risk)}</b><em>риски / просрочено</em></button>
      </div>
      <div class="launch-calendar-legend" aria-label="Легенда статусов новинок">
        ${stats.statusThemes.map((theme) => `
          <button type="button" class="${view.statusTheme === theme.key ? 'active' : ''}" data-launch-calendar-status-quick="${escapeHtml(theme.key)}" style="--launch-status-color:${theme.color}">
            <i aria-hidden="true"></i><span>${escapeHtml(theme.label)}</span>
          </button>
        `).join('')}
      </div>
    </section>
  `;
}

function renderLaunchCalendarDay(day, items = [], monthKey = '') {
  const inMonth = launchCalendarStartOfMonth(day) === launchCalendarStartOfMonth(monthKey);
  const today = todayIso();
  const dayItems = (items || [])
    .filter((item) => launchCalendarValidDateKey(launchDueDateKey(item)) === day)
    .sort((left, right) => launchCalendarMissionTone(right).localeCompare(launchCalendarMissionTone(left)) || String(left.name || '').localeCompare(String(right.name || ''), 'ru'));
  const className = [
    'promo-calendar-day',
    'promo-kind-launch',
    inMonth ? '' : 'muted-day',
    day === today ? 'today' : '',
    dayItems.length ? 'has-events' : ''
  ].filter(Boolean).join(' ');
  return `
    <div class="${className}" role="gridcell" data-launch-calendar-day="${escapeHtml(day)}" aria-label="${escapeHtml(launchCalendarShortDateLabel(day))}">
      <div class="promo-day-head">
        <span>${launchCalendarDateFromKey(day).getDate()}</span>
        <em>${day === today ? 'сегодня' : dayItems.length ? `${fmt.int(dayItems.length)} нов.` : ''}</em>
      </div>
      <div class="promo-day-events ${dayItems.length > 4 ? 'scrollable' : ''}">
        ${dayItems.map(renderLaunchCalendarPill).join('')}
      </div>
    </div>
  `;
}

function renderLaunchCalendarWorkspace(items = []) {
  const view = launchCalendarState();
  if (!view.month) view.month = launchCalendarDefaultMonth(items);
  const groups = launchCalendarUniqueOptions(items, (item) => item.reportGroup);
  const statuses = launchCalendarUniqueOptions(items, (item) => item.status);
  if (view.group !== 'all' && !groups.includes(view.group)) view.group = 'all';
  if (view.status !== 'all' && !statuses.includes(view.status)) view.status = 'all';
  const filteredItems = launchCalendarFilteredItems(items);
  const baseFilteredItems = launchCalendarFilteredItems(items, { applyFocus: false });
  const monthItems = filteredItems.filter((item) => launchCalendarStartOfMonth(launchDueDateKey(item)) === view.month);
  const baseMonthItems = baseFilteredItems.filter((item) => launchCalendarStartOfMonth(launchDueDateKey(item)) === view.month);
  const gridDays = launchCalendarMonthDays(view.month);
  const monthCounterLabel = view.focus === 'risk' ? `${fmt.int(monthItems.length)} рисков` : `${fmt.int(monthItems.length)} новинок`;
  return `
    <div class="promo-calendar-shell launch-calendar-shell">
      <section class="promo-calendar-command launch-calendar-command">
        <div class="promo-calendar-command-copy">
          <span>Новинки</span>
          <h2>Календарь запусков</h2>
        </div>
        <div class="promo-calendar-command-actions">
          ${badge(`${fmt.int(filteredItems.length)} новинок`, filteredItems.length ? 'info' : 'warn')}
          <button class="quick-chip" type="button" data-launch-calendar-today>Сегодня</button>
          <button class="quick-chip portal-action-primary" type="button" data-launch-add>Новая</button>
        </div>
      </section>

      <section class="promo-calendar-toolbar launch-calendar-toolbar">
        <label>
          <span>Поиск</span>
          <input type="search" data-launch-calendar-search value="${escapeHtml(view.search)}" placeholder="товар, SKU, статус">
        </label>
        <label>
          <span>Группа</span>
          <select data-launch-calendar-group>
            <option value="all">Все группы</option>
            ${groups.map((group) => `<option value="${escapeHtml(group)}" ${view.group === group ? 'selected' : ''}>${escapeHtml(group)}</option>`).join('')}
          </select>
        </label>
        <label>
          <span>Статус</span>
          <select data-launch-calendar-status>
            <option value="all">Все статусы</option>
            ${statuses.map((status) => `<option value="${escapeHtml(status)}" ${view.status === status ? 'selected' : ''}>${escapeHtml(status)}</option>`).join('')}
          </select>
        </label>
      </section>

      ${renderLaunchCalendarGame(baseMonthItems, baseFilteredItems)}

      <section class="promo-calendar-layout launch-calendar-layout">
        <div class="promo-calendar-board launch-calendar-board">
          <div class="promo-month-head">
            <button type="button" data-launch-calendar-month="-1">‹</button>
            <strong>${escapeHtml(launchCalendarMonthLabel(view.month))} · ${monthCounterLabel}</strong>
            <button type="button" data-launch-calendar-month="1">›</button>
          </div>
          <div class="promo-weekdays">${LAUNCH_CALENDAR_WEEKDAYS.map((day) => `<span>${day}</span>`).join('')}</div>
          <div class="promo-month-grid" role="grid">${gridDays.map((day) => renderLaunchCalendarDay(day, filteredItems, view.month)).join('')}</div>
        </div>
      </section>
    </div>
  `;
}

function moveLaunchCalendarItem(launchId = '', day = '') {
  const dateKey = launchCalendarValidDateKey(day);
  if (!launchId || !dateKey) return;
  const item = getLaunchItems({ skipTaskLookup: true }).find((entry) => entry.id === launchId);
  if (!item) return;
  upsertLaunchDraft({
    ...item,
    launchDate: dateKey,
    launchMonth: launchMonthKeyToLabel(dateKey.slice(0, 7)) || item.launchMonth
  });
  launchCalendarState().month = launchCalendarStartOfMonth(dateKey);
  if (typeof setAppError === 'function') setAppError(`Дата запуска обновлена: ${launchCalendarShortDateLabel(dateKey)}.`);
  rerenderCurrentView();
}

function openLaunchCalendarNewItem(day = '') {
  const dateKey = launchCalendarValidDateKey(day);
  if (!dateKey) return;
  openLaunchEditor('', {
    launchDate: dateKey,
    launchMonth: launchMonthKeyToLabel(dateKey.slice(0, 7)) || state.dashboard?.dataFreshness?.launchPlanHorizon || 'Текущий фокус',
    status: 'Черновик'
  });
}

function bindLaunchCalendar(root) {
  const view = launchCalendarState();
  root.querySelector('[data-launch-calendar-search]')?.addEventListener('input', (event) => {
    view.search = event.target.value;
    rerenderCurrentView();
  });
  root.querySelector('[data-launch-calendar-group]')?.addEventListener('change', (event) => {
    view.group = event.target.value || 'all';
    rerenderCurrentView();
  });
  root.querySelector('[data-launch-calendar-status]')?.addEventListener('change', (event) => {
    view.status = event.target.value || 'all';
    view.statusTheme = 'all';
    rerenderCurrentView();
  });
  root.querySelectorAll('[data-launch-calendar-status-quick]').forEach((button) => {
    button.addEventListener('click', () => {
      const theme = button.getAttribute('data-launch-calendar-status-quick') || 'all';
      view.statusTheme = view.statusTheme === theme ? 'all' : theme;
      view.status = 'all';
      rerenderCurrentView();
    });
  });
  root.querySelectorAll('[data-launch-calendar-focus]').forEach((button) => {
    button.addEventListener('click', () => {
      const focus = button.getAttribute('data-launch-calendar-focus') || 'all';
      view.focus = focus === 'risk' && view.focus !== 'risk' ? 'risk' : 'all';
      rerenderCurrentView();
    });
  });
  root.querySelectorAll('[data-launch-calendar-month]').forEach((button) => {
    button.addEventListener('click', () => {
      view.month = launchCalendarAddMonths(view.month, button.getAttribute('data-launch-calendar-month'));
      rerenderCurrentView();
    });
  });
  root.querySelector('[data-launch-calendar-today]')?.addEventListener('click', () => {
    view.month = launchCalendarStartOfMonth(todayIso());
    rerenderCurrentView();
  });
  root.querySelectorAll('[data-launch-add]').forEach((button) => {
    button.addEventListener('click', () => openLaunchEditor());
  });
  root.querySelectorAll('[data-launch-calendar-day]').forEach((day) => {
    day.addEventListener('click', (event) => {
      if (event.target?.closest?.('[data-launch-calendar-event]')) return;
      openLaunchCalendarNewItem(day.getAttribute('data-launch-calendar-day') || '');
    });
    day.addEventListener('dragover', (event) => {
      event.preventDefault();
      day.classList.add('drag-over');
    });
    day.addEventListener('dragleave', () => day.classList.remove('drag-over'));
    day.addEventListener('drop', (event) => {
      event.preventDefault();
      day.classList.remove('drag-over');
      const id = event.dataTransfer?.getData('application/x-launch-item') || event.dataTransfer?.getData('text/plain');
      moveLaunchCalendarItem(id, day.getAttribute('data-launch-calendar-day') || '');
    });
  });
  root.querySelectorAll('[data-launch-calendar-event]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openLaunchEditor(button.getAttribute('data-launch-calendar-event') || '');
    });
    button.addEventListener('dragstart', (event) => {
      const id = button.getAttribute('data-launch-calendar-event') || '';
      event.dataTransfer?.setData('text/plain', id);
      event.dataTransfer?.setData('application/x-launch-item', id);
    });
  });
}

function renderLaunchesDirectorLite(rootId = 'view-launches') {
  const root = document.getElementById(rootId);
  if (!root) return;
  const launchCalendarTaskCounts = launchTaskCountMap();
  const launchCalendarItems = getLaunchItems({ skipTaskLookup: true }).map((item) => launchWithTaskCount(item, launchCalendarTaskCounts));
  root.innerHTML = renderLaunchCalendarWorkspace(launchCalendarItems);
  bindLaunchCalendar(root);
  return;
  const model = getLaunchViewModel();
  const taskCounts = launchTaskCountMap();
  const filteredItems = model.filteredItems.map((item) => launchWithTaskCount(item, taskCounts));
  const workItems = [...filteredItems]
    .sort((left, right) => launchDirectorPriority(right) - launchDirectorPriority(left) || launchMonthSortValue(left.launchMonth) - launchMonthSortValue(right.launchMonth) || left.name.localeCompare(right.name, 'ru'));
  const actionItems = workItems.filter((item) => !launchIsReady(item) || (item.blockers || []).length).slice(0, 10);
  const readyItems = workItems.filter(launchIsReady).slice(0, 6);
  const upcomingItems = (model.upcomingItems.length ? model.upcomingItems.map((item) => launchWithTaskCount(item, taskCounts)) : workItems).slice(0, 6);
  const withoutOwner = filteredItems.filter((item) => !launchHasOwner(item)).length;
  const withoutSku = filteredItems.filter((item) => !launchHasLinkedSku(item)).length;
  const withoutMaterials = filteredItems.filter((item) => !launchHasPresentation(item)).length;
  const readyCount = filteredItems.filter(launchIsReady).length;
  const ganttExpanded = launchGanttExpanded();
  const monthsExpanded = launchMonthsExpanded();

  root.innerHTML = `
    <div class="section-title launch-director-title">
      <div>
        <h2>Новинки</h2>
        <p>Календарь запусков и короткие статусы по товарам.</p>
      </div>
      <div class="badge-stack launch-director-badges">
        ${badge(`${fmt.int(filteredItems.length)} новинок`, filteredItems.length ? 'info' : 'warn')}
      </div>
    </div>

    <div class="launch-sticky-calendar">
      ${renderLaunchAutoGraph(filteredItems)}
    </div>

    ${renderLaunchProjectBoard(filteredItems)}

    ${renderLaunchMonthFilters({ ...model, filteredItems })}

    <details class="card launch-secondary-details">
      <summary>
        <div>
          <h3>Контроль запуска</h3>
        </div>
        ${badge(`${fmt.int(actionItems.length)} в фокусе`, actionItems.length ? 'warn' : 'ok')}
      </summary>
      <div class="two-col launch-work-columns launch-work-columns-secondary">
        ${renderLaunchAttentionPanel(actionItems, { total: filteredItems.length, withoutOwner, withoutSku, withoutMaterials, ready: readyCount })}
        ${renderLaunchRedZone(filteredItems)}
      </div>
    </details>

    <details class="card launch-gantt-card" data-launch-gantt-fold ${ganttExpanded ? 'open' : ''}>
      <summary>
        <div>
          <h3>Календарь запуска по фильтру</h3>
          <p class="small muted">Полный календарь открыт только по кнопке, чтобы сверху оставался рабочий экран.</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(model.ganttColumns.length)} месяцев`, model.ganttColumns.length ? 'info' : 'warn')}
          ${badge(ganttExpanded ? 'Свернуть' : 'Показать', 'info')}
        </div>
      </summary>
      ${ganttExpanded ? renderLaunchDirectorGantt(filteredItems, model.ganttColumns) : ''}
    </details>

    <details class="card launch-months-card" data-launch-months-fold ${monthsExpanded ? 'open' : ''}>
      <summary>
        <div>
          <h3>Все по месяцам</h3>
          <p class="small muted">Полный список оставлен ниже, чтобы рабочий экран сверху не превращался в простыню.</p>
        </div>
        <div class="badge-stack">
          ${badge(`${fmt.int(model.sections.length)} месяцев`, model.sections.length ? 'info' : 'ok')}
          ${badge(monthsExpanded ? 'Свернуть' : 'Показать', 'info')}
        </div>
      </summary>
      ${monthsExpanded ? `<div class="launch-month-sections">
        ${model.sections.map((section) => `
          <div class="launch-month-block">
            <div class="section-subhead">
              <div><h3>${escapeHtml(section.label)}</h3></div>
              ${badge(`${fmt.int(section.items.length)} SKU`, section.items.length ? 'info' : '')}
            </div>
            <div class="launch-card-list">${section.items.slice(0, 12).map((item) => renderLaunchDirectorCard(launchWithTaskCount(item, taskCounts))).join('') || '<div class="empty">Нет строк.</div>'}</div>
          </div>
        `).join('') || '<div class="empty">Новинок не найдено.</div>'}
      </div>` : ''}
    </details>

    <div class="card launch-ready-card">
      <div class="section-subhead">
        <div>
          <h3>Готово к запуску</h3>
          <p class="small muted">Строки, где заполнены owner, SKU, материалы и календарь запуска, без явных блокеров.</p>
        </div>
        ${badge(`${fmt.int(readyCount)} готово`, readyCount ? 'ok' : 'warn')}
      </div>
      <div class="launch-card-list compact">${readyItems.map(renderLaunchDirectorCard).join('') || '<div class="empty">Готовых строк пока нет.</div>'}</div>
    </div>
  `;

  bindLaunchMonthFilters(root, { ...model, filteredItems });
  bindLaunchGanttFold(root);
  bindLaunchMonthsFold(root);
  bindLaunchProjectActions(root);
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
        <p>Единый слой по новинкам: фильтры по календарю, карточки товаров, связь с реестром SKU, календарь запуска и выгрузка в Excel.</p>
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
      <div class="mini-kpi"><span>Календарь заполнен</span><strong>${fmt.int(model.filteredSummary.withGantt)}</strong><span>контроль по срокам</span></div>
    </div>

    ${renderLaunchMonthFilters(model)}

    ${model.ganttColumns.length ? `
      <details class="card" style="margin-top:14px" data-launch-gantt-fold ${ganttExpanded ? 'open' : ''}>
        <summary style="list-style:none; cursor:pointer;">
          <div class="section-subhead">
            <div>
              <h3>Календарь запуска по фильтру</h3>
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
              ${ganttRows || `<tr><td colspan="${model.ganttColumns.length + 1}"><div class="empty">Календарь запуска по текущему фильтру пока пустой.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </details>
    ` : ''}

    <div class="card launch-audit-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Источник и покрытие</h3>
          <p class="small muted">Карточки и календарь запуска подтягиваются из файла Ксюши. Если новинка уже заведена в реестре SKU, здесь должны появляться связка, owner и задачи.</p>
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

function renderLaunches() {
  return renderLaunchesDirectorLite('view-launches');
}

function renderLaunchControl() {
  return renderLaunchesDirectorLite('view-launch-control');
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
