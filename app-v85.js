(function () {
  const TABLE = 'portal_novelty_launches';
  const STORAGE_KEY = 'brand-portal-v85-launch-control-v1';
  const STATUS_META = {
    not_started: { label: 'Не начат', kind: '' },
    prep: { label: 'Подготовка', kind: 'info' },
    active_launch: { label: 'Активный запуск', kind: 'warn' },
    growth: { label: 'Самостоятельный рост', kind: 'ok' },
    delayed: { label: 'Задержан', kind: 'danger' },
    paused: { label: 'Пауза', kind: 'danger' },
    done: { label: 'Завершён', kind: 'ok' }
  };
  const PHASES = [
    { key: 'prep', label: 'Подготовка к отгрузке', order: 1 },
    { key: 'active', label: 'Активный запуск', order: 2 },
    { key: 'growth', label: 'Самостоятельный рост', order: 3 }
  ];

  state.v85 = Object.assign({
    launches: [],
    filters: {
      search: '',
      marketplace: 'all',
      owner: 'all',
      planMonth: 'all',
      status: 'all',
      riskOnly: false,
      overdueOnly: false
    },
    ui: {
      selectedLaunchId: '',
      schemaReady: null
    },
    remote: {
      note: '',
      error: ''
    }
  }, state.v85 || {});

  function n(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function bool(value) {
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'да', 'risk', 'on'].includes(String(value || '').toLowerCase());
  }

  function uidSafe(prefix) {
    return typeof uid === 'function' ? uid(prefix) : `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function stableIdSafe(prefix, raw) {
    return typeof stableId === 'function'
      ? stableId(prefix, raw)
      : `${prefix}-${btoa(unescape(encodeURIComponent(String(raw || Math.random())))).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`;
  }

  function currentBrandSafe() {
    try { return typeof currentBrand === 'function' ? currentBrand() : 'Алтея'; } catch { return 'Алтея'; }
  }

  function saveLaunchStore() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.v85.launches || []));
    } catch (error) {
      console.error(error);
    }
  }

  function loadLaunchStore() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      state.v85.launches = Array.isArray(raw) ? raw.map(normalizeLaunchRecord) : [];
    } catch (error) {
      console.error(error);
      state.v85.launches = [];
    }
  }

  function noveltyList() {
    return Array.isArray(state.v76?.store?.novelties) ? state.v76.store.novelties : [];
  }

  function monthMap() {
    return {
      'Январь': 1, 'Февраль': 2, 'Март': 3, 'Апрель': 4, 'Май': 5, 'Июнь': 6,
      'Июль': 7, 'Август': 8, 'Сентябрь': 9, 'Октябрь': 10, 'Ноябрь': 11, 'Декабрь': 12
    };
  }

  function monthKey(label) {
    const raw = String(label || '').trim();
    if (!raw) return '';
    const parts = raw.split(/\s+/);
    const month = monthMap()[parts[0]] || 0;
    const year = Number(parts[1]) || 0;
    if (!month || !year) return '';
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  function monthDelay(planLabel, factLabel) {
    const a = monthKey(planLabel);
    const b = monthKey(factLabel);
    if (!a || !b) return null;
    const [ay, am] = a.split('-').map(Number);
    const [by, bm] = b.split('-').map(Number);
    return (by - ay) * 12 + (bm - am);
  }

  function defaultStatusFromNovelty(novelty) {
    if (novelty?.launchMonthFact) return 'done';
    if (novelty?.stage === 'live') return 'active_launch';
    if (['launch_ready', 'production', 'packaging', 'sample', 'formula', 'brief'].includes(novelty?.stage)) return 'prep';
    return 'not_started';
  }

  function defaultPhaseFromStatus(status) {
    if (status === 'growth' || status === 'done') return 'growth';
    if (status === 'active_launch') return 'active';
    return 'prep';
  }

  function normalizeLaunchRecord(row = {}) {
    const novelty = noveltyList().find((item) => String(item.id) === String(row.noveltyId || row.novelty_id || row.novelty_id_ref || ''))
      || noveltyList().find((item) => String(item.productCode) === String(row.articleKey || row.article_key || row.product_code || ''))
      || null;
    const marketplace = String(row.marketplace || row.mp || 'wb').trim().toLowerCase() || 'wb';
    const launchStatus = STATUS_META[row.launchStatus || row.launch_status] ? (row.launchStatus || row.launch_status) : defaultStatusFromNovelty(novelty);
    const rec = {
      id: row.id || stableIdSafe('launch', `${row.noveltyId || row.novelty_id || novelty?.id || row.articleKey || row.article_key || row.name || ''}|${marketplace}`),
      noveltyId: String(row.noveltyId || row.novelty_id || novelty?.id || '').trim(),
      articleKey: String(row.articleKey || row.article_key || row.product_code || novelty?.productCode || '').trim(),
      noveltyName: String(row.noveltyName || row.novelty_name || novelty?.name || 'Новинка').trim() || 'Новинка',
      ownerName: String(row.ownerName || row.owner_name || row.owner || novelty?.owner || 'Маша').trim() || 'Маша',
      marketplace,
      launchPlanMonth: String(row.launchPlanMonth || row.launch_plan_month || novelty?.launchMonth || '').trim(),
      launchFactMonth: String(row.launchFactMonth || row.launch_fact_month || novelty?.launchMonthFact || '').trim(),
      launchPlanDate: String(row.launchPlanDate || row.launch_plan_date || novelty?.anchorDate || '').trim(),
      launchFactDate: String(row.launchFactDate || row.launch_fact_date || '').trim(),
      launchStatus,
      currentPhase: String(row.currentPhase || row.current_phase || defaultPhaseFromStatus(launchStatus)).trim() || 'prep',
      riskFlag: bool(row.riskFlag ?? row.risk_flag ?? row.risk ?? novelty?.risk),
      blocker: String(row.blocker || '').trim(),
      nextStep: String(row.nextStep || row.next_step || novelty?.nextStep || '').trim(),
      notes: String(row.notes || row.note || '').trim(),
      createdAt: row.createdAt || row.created_at || new Date().toISOString(),
      updatedAt: row.updatedAt || row.updated_at || new Date().toISOString()
    };
    rec.delayMonths = monthDelay(rec.launchPlanMonth, rec.launchFactMonth);
    return rec;
  }

  function seedLaunchesFromNovelties() {
    return noveltyList().map((novelty) => normalizeLaunchRecord({
      noveltyId: novelty.id,
      articleKey: novelty.productCode,
      noveltyName: novelty.name,
      ownerName: novelty.owner || 'Маша',
      marketplace: 'wb',
      launchPlanMonth: novelty.launchMonth,
      launchFactMonth: novelty.launchMonthFact,
      launchPlanDate: novelty.anchorDate || '',
      launchStatus: defaultStatusFromNovelty(novelty),
      currentPhase: defaultPhaseFromStatus(defaultStatusFromNovelty(novelty)),
      riskFlag: novelty.risk,
      blocker: novelty.blockers || '',
      nextStep: novelty.nextStep || ''
    }));
  }

  function mergeLaunches(seed, local, remote) {
    const map = new Map();
    const ingest = (rows) => rows.forEach((row) => {
      const normalized = normalizeLaunchRecord(row);
      const prev = map.get(normalized.id);
      if (!prev) {
        map.set(normalized.id, normalized);
        return;
      }
      const next = { ...prev, ...normalized };
      if (!normalized.blocker && prev.blocker) next.blocker = prev.blocker;
      if (!normalized.nextStep && prev.nextStep) next.nextStep = prev.nextStep;
      if (!normalized.notes && prev.notes) next.notes = prev.notes;
      if (!normalized.launchFactDate && prev.launchFactDate) next.launchFactDate = prev.launchFactDate;
      if (!normalized.launchFactMonth && prev.launchFactMonth) next.launchFactMonth = prev.launchFactMonth;
      map.set(normalized.id, normalizeLaunchRecord(next));
    });
    ingest(seed || []);
    ingest(local || []);
    ingest(remote || []);
    return Array.from(map.values()).sort((a, b) => String(a.launchPlanMonth || '').localeCompare(String(b.launchPlanMonth || '')) || String(a.noveltyName || '').localeCompare(String(b.noveltyName || ''), 'ru'));
  }

  function ensureLaunchStoreSeeded() {
    const seeded = seedLaunchesFromNovelties();
    state.v85.launches = mergeLaunches(seeded, state.v85.launches || [], []);
    if (!state.v85.ui.selectedLaunchId && state.v85.launches[0]) state.v85.ui.selectedLaunchId = state.v85.launches[0].id;
    saveLaunchStore();
  }

  async function queryLaunchRemote() {
    if (!hasRemoteStore() || !state.team?.client) return [];
    const response = await state.team.client.from(TABLE).select('*').eq('brand', currentBrandSafe()).order('updated_at', { ascending: false });
    if (response.error) throw response.error;
    return Array.isArray(response.data) ? response.data : [];
  }

  function remoteRow(row) {
    return {
      id: row.id,
      brand: currentBrandSafe(),
      novelty_id: row.noveltyId || '',
      article_key: row.articleKey || '',
      novelty_name: row.noveltyName || '',
      owner_name: row.ownerName || '',
      marketplace: row.marketplace || 'wb',
      launch_plan_month: row.launchPlanMonth || '',
      launch_fact_month: row.launchFactMonth || '',
      launch_plan_date: row.launchPlanDate || null,
      launch_fact_date: row.launchFactDate || null,
      launch_status: row.launchStatus || 'not_started',
      current_phase: row.currentPhase || 'prep',
      risk_flag: !!row.riskFlag,
      blocker: row.blocker || '',
      next_step: row.nextStep || '',
      notes: row.notes || '',
      updated_at: new Date().toISOString()
    };
  }

  async function pullRemoteLaunches(rerender = true) {
    ensureLaunchStoreSeeded();
    if (!hasRemoteStore() || !state.team?.client) return;
    try {
      const remote = await queryLaunchRemote();
      const seeded = seedLaunchesFromNovelties();
      state.v85.launches = mergeLaunches(seeded, state.v85.launches || [], remote || []);
      saveLaunchStore();
      state.v85.remote.note = `Запуски новинок синхронизированы · ${fmt.date(new Date().toISOString())}`;
      state.v85.remote.error = '';
      state.v85.ui.schemaReady = true;
      if (rerender && typeof rerenderCurrentView === 'function') rerenderCurrentView();
    } catch (error) {
      console.error(error);
      state.v85.remote.error = error.message || 'Ошибка синка запусков';
      state.v85.remote.note = 'Запуски новинок работают локально';
    }
  }

  async function pushRemoteLaunches() {
    ensureLaunchStoreSeeded();
    if (!hasRemoteStore() || !state.team?.client) return;
    try {
      const rows = (state.v85.launches || []).map(remoteRow);
      const response = await state.team.client.from(TABLE).upsert(rows, { onConflict: 'id' });
      if (response.error) throw response.error;
      state.v85.remote.note = `Запуски новинок выгружены · ${fmt.date(new Date().toISOString())}`;
      state.v85.remote.error = '';
      state.v85.ui.schemaReady = true;
    } catch (error) {
      console.error(error);
      state.v85.remote.error = error.message || 'Ошибка выгрузки запусков';
      state.v85.remote.note = 'Не удалось выгрузить запуски новинок';
    }
  }

  function ensureDom() {
    const nav = document.querySelector('.nav');
    if (nav && !nav.querySelector('.nav-btn[data-view="launch-control"]')) {
      const btn = document.createElement('button');
      btn.className = 'nav-btn';
      btn.dataset.view = 'launch-control';
      btn.innerHTML = '<span>Запуск новинок</span><small>Маша · чек-листы · фазы · просрочки</small>';
      const meetingsBtn = nav.querySelector('.nav-btn[data-view="meetings"]');
      if (meetingsBtn) nav.insertBefore(btn, meetingsBtn);
      else nav.appendChild(btn);
      btn.addEventListener('click', () => setView('launch-control'));
    }
    const main = document.querySelector('.main');
    if (main && !document.getElementById('view-launch-control')) {
      const section = document.createElement('section');
      section.className = 'view';
      section.id = 'view-launch-control';
      const meetingsView = document.getElementById('view-meetings');
      if (meetingsView) main.insertBefore(section, meetingsView);
      else main.appendChild(section);
    }
  }

  function checklistTasksForLaunch(launch) {
    return (state.storage?.tasks || []).filter((task) => task.source === 'launch_checklist' && String(task.articleKey) === String(launch.articleKey));
  }

  function parsePhase(task) {
    const raw = String(task.phase || task.phaseKey || task.phase_key || '').trim().toLowerCase();
    if (raw) {
      if (raw.startsWith('prep')) return 'prep';
      if (raw.startsWith('active')) return 'active';
      if (raw.startsWith('growth')) return 'growth';
    }
    const title = String(task.title || '');
    if (title.startsWith('Подготовка к отгрузке')) return 'prep';
    if (title.startsWith('Активный запуск')) return 'active';
    if (title.startsWith('Самостоятельный рост')) return 'growth';
    return 'prep';
  }

  function deriveStatusFromTasks(launch, tasks) {
    if (!tasks.length) return launch.launchStatus || 'not_started';
    const active = tasks.filter((task) => typeof isTaskActive === 'function' ? isTaskActive(task) : task.status !== 'done');
    const overdue = active.filter((task) => typeof isTaskOverdue === 'function' ? isTaskOverdue(task) : false);
    const done = tasks.filter((task) => task.status === 'done');
    if (done.length === tasks.length) return 'done';
    if (overdue.length) return 'delayed';
    const phases = ['prep', 'active', 'growth'];
    const firstOpenPhase = phases.find((phase) => tasks.some((task) => parsePhase(task) === phase && task.status !== 'done'));
    if (firstOpenPhase === 'growth') return 'growth';
    if (firstOpenPhase === 'active') return 'active_launch';
    if (firstOpenPhase === 'prep') return 'prep';
    return launch.launchStatus || 'not_started';
  }

  function derivePhaseFromTasks(tasks, launch) {
    const phases = ['prep', 'active', 'growth'];
    const firstOpen = phases.find((phase) => tasks.some((task) => parsePhase(task) === phase && task.status !== 'done'));
    if (firstOpen) return firstOpen;
    return launch.currentPhase || defaultPhaseFromStatus(launch.launchStatus);
  }

  function launchRows() {
    ensureLaunchStoreSeeded();
    const rows = (state.v85.launches || []).map((launch) => {
      const novelty = noveltyList().find((item) => String(item.id) === String(launch.noveltyId)) || noveltyList().find((item) => String(item.productCode) === String(launch.articleKey)) || null;
      const tasks = checklistTasksForLaunch(launch);
      const done = tasks.filter((task) => task.status === 'done').length;
      const overdue = tasks.filter((task) => (typeof isTaskOverdue === 'function' ? isTaskOverdue(task) : false) && (typeof isTaskActive === 'function' ? isTaskActive(task) : task.status !== 'done')).length;
      const status = deriveStatusFromTasks(launch, tasks);
      const phase = derivePhaseFromTasks(tasks, launch);
      const total = tasks.length;
      const progressPct = total ? Math.round((done / total) * 100) : 0;
      const combinedRisk = !!launch.riskFlag || overdue > 0 || (status === 'delayed');
      return {
        ...launch,
        novelty,
        tasks,
        total,
        done,
        overdue,
        progressPct,
        derivedStatus: status,
        derivedPhase: phase,
        combinedRisk,
        delayMonths: monthDelay(launch.launchPlanMonth, launch.launchFactMonth)
      };
    });

    return rows.filter((row) => {
      const hay = [row.articleKey, row.noveltyName, row.ownerName, row.blocker, row.nextStep].join(' ').toLowerCase();
      if (state.v85.filters.search && !hay.includes(String(state.v85.filters.search).toLowerCase())) return false;
      if (state.v85.filters.marketplace !== 'all' && row.marketplace !== state.v85.filters.marketplace) return false;
      if (state.v85.filters.owner !== 'all' && row.ownerName !== state.v85.filters.owner) return false;
      if (state.v85.filters.planMonth !== 'all' && row.launchPlanMonth !== state.v85.filters.planMonth) return false;
      if (state.v85.filters.status !== 'all' && row.derivedStatus !== state.v85.filters.status) return false;
      if (state.v85.filters.riskOnly && !row.combinedRisk) return false;
      if (state.v85.filters.overdueOnly && !row.overdue) return false;
      return true;
    }).sort((a, b) => Number(b.combinedRisk) - Number(a.combinedRisk) || b.overdue - a.overdue || String(a.launchPlanMonth || '').localeCompare(String(b.launchPlanMonth || '')) || String(a.noveltyName || '').localeCompare(String(b.noveltyName || ''), 'ru'));
  }

  function ownerOptions() {
    const set = new Set(['Маша', 'Ксения']);
    (state.storage?.tasks || []).forEach((task) => task.owner && set.add(task.owner));
    noveltyList().forEach((row) => row.owner && set.add(row.owner));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }

  function selectedLaunch(rows) {
    if (!state.v85.ui.selectedLaunchId && rows[0]) state.v85.ui.selectedLaunchId = rows[0].id;
    return rows.find((row) => row.id === state.v85.ui.selectedLaunchId) || rows[0] || null;
  }

  async function ensureChecklist(launch) {
    let template = { tasks: [] };
    try {
      template = await loadJson('data/launch_checklist_template.json');
    } catch (error) {
      console.error(error);
    }
    const anchor = launch.launchPlanDate || plusDays(7);
    const existingKeys = new Set((state.storage?.tasks || []).filter((task) => task.source === 'launch_checklist' && String(task.articleKey) === String(launch.articleKey)).map((task) => `${task.source}|${task.articleKey}|${task.title}`));
    const created = [];
    (template.tasks || []).forEach((item) => {
      const title = `${item.phase_label}: ${item.task_title}`;
      const key = `launch_checklist|${launch.articleKey}|${title}`;
      if (existingKeys.has(key)) return;
      const due = new Date(anchor);
      due.setDate(due.getDate() + n(item.relative_finish_day));
      const task = normalizeTask({
        id: uidSafe('task'),
        articleKey: launch.articleKey,
        title,
        reason: item.task_description || '',
        nextAction: item.notes_hint || launch.nextStep || '',
        owner: launch.ownerName || 'Маша',
        due: due.toISOString().slice(0, 10),
        status: 'new',
        type: item.category && /логист/i.test(item.category) ? 'supply' : item.category && /контент|отзывы|реклама|ctr|полки|акции|органика/i.test(item.category) ? 'traffic' : item.category && /экономика|цена/i.test(item.category) ? 'pricing' : 'launch',
        priority: item.is_critical ? 'critical' : 'medium',
        platform: launch.marketplace || 'wb',
        source: 'launch_checklist',
        entityLabel: launch.noveltyName
      }, 'manual');
      state.storage.tasks.unshift(task);
      created.push(task);
    });
    saveLocalStorage();
    try {
      for (const task of created) await persistTask(task);
    } catch (error) {
      console.error(error);
    }
    const record = state.v85.launches.find((item) => item.id === launch.id);
    if (record) {
      record.launchStatus = record.launchStatus === 'not_started' ? 'prep' : record.launchStatus;
      record.currentPhase = 'prep';
      record.updatedAt = new Date().toISOString();
      saveLaunchStore();
      try { await pushRemoteLaunches(); } catch (error) { console.error(error); }
    }
    if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
    alert(`Создано задач по запуску: ${created.length}`);
  }

  function helperLinkCard() {
    return `
      <div class="card v85-link-card">
        <div class="head">
          <div>
            <h3>Запуск новинок вынесен отдельно</h3>
            <div class="muted small">Чтобы разгрузить Ксению и сделать для Маши явный контур контроля запуска.</div>
          </div>
          ${badge('новая вкладка', 'info')}
        </div>
        <div class="v85-link-card-row">
          <div class="muted">Откройте вкладку <strong>«Запуск новинок»</strong>, чтобы видеть реестр запусков, фазы, чек-листы и просрочки.</div>
          <button class="btn" type="button" data-v85-open-launch-tab>Перейти в запуск новинок</button>
        </div>
      </div>`;
  }

  function lightenProductView() {
    const root = document.getElementById('view-launches');
    if (!root) return;
    const sections = Array.from(root.querySelectorAll('.v80-section'));
    const launchSection = sections.find((section) => section.querySelector('h3')?.textContent?.includes('Запуски / Чек-листы новинок'));
    if (launchSection) launchSection.remove();
    const summary = root.querySelector('.section-title');
    if (summary) {
      const p = summary.querySelector('p');
      if (p) p.textContent = 'Продуктовый кабинет: товары, экономика, статусы, карточки новинок, тетрадь действий и задачи Ксении.';
    }
    if (!root.querySelector('.v85-link-card')) {
      const firstCard = root.querySelector('.card.v80-section');
      if (firstCard) firstCard.insertAdjacentHTML('afterend', helperLinkCard());
      else root.insertAdjacentHTML('beforeend', helperLinkCard());
      root.querySelector('[data-v85-open-launch-tab]')?.addEventListener('click', () => setView('launch-control'));
    }
  }

  function summaryCards(rows) {
    const counts = {
      total: rows.length,
      inWork: rows.filter((row) => ['prep', 'active_launch', 'growth', 'delayed', 'paused'].includes(row.derivedStatus)).length,
      delayed: rows.filter((row) => row.derivedStatus === 'delayed').length,
      risk: rows.filter((row) => row.combinedRisk).length,
      noChecklist: rows.filter((row) => !row.total).length,
      overdue: rows.reduce((sum, row) => sum + row.overdue, 0),
      noOwner: rows.filter((row) => !row.ownerName).length,
      noTraffic: rows.filter((row) => row.tasks.some((task) => /трафик|реклама|ctr|акции|органика/i.test(task.title || '') === false) && row.total > 0).length
    };
    const items = [
      ['Всего запусков', counts.total, 'info'],
      ['В работе', counts.inWork, counts.inWork ? 'info' : ''],
      ['С риском', counts.risk, counts.risk ? 'danger' : 'ok'],
      ['Просрочено задач', counts.overdue, counts.overdue ? 'danger' : 'ok'],
      ['Без owner', counts.noOwner, counts.noOwner ? 'warn' : 'ok'],
      ['Без checklist', counts.noChecklist, counts.noChecklist ? 'warn' : 'ok']
    ];
    return `<div class="grid cards">${items.map(([label, value, kind]) => `<div class="card kpi"><div class="label">${escapeHtml(label)}</div><div class="value">${fmt.int(value)}</div>${badge(String(value), kind)}</div>`).join('')}</div>`;
  }

  function phaseBoard(launch) {
    const tasks = checklistTasksForLaunch(launch);
    const groups = PHASES.map((phase) => {
      const items = tasks.filter((task) => parsePhase(task) === phase.key).sort((a, b) => String(a.due || '').localeCompare(String(b.due || '')) || String(a.title || '').localeCompare(String(b.title || ''), 'ru'));
      return { phase, items, done: items.filter((task) => task.status === 'done').length, overdue: items.filter((task) => (typeof isTaskOverdue === 'function' ? isTaskOverdue(task) : false) && (typeof isTaskActive === 'function' ? isTaskActive(task) : task.status !== 'done')).length };
    });
    return groups.map(({ phase, items, done, overdue }) => `
      <div class="v85-phase-card">
        <div class="head">
          <div>
            <h4>${escapeHtml(phase.label)}</h4>
            <div class="muted small">${fmt.int(done)} / ${fmt.int(items.length)} выполнено</div>
          </div>
          <div class="badge-stack">${badge(`Просрочено ${fmt.int(overdue)}`, overdue ? 'danger' : 'ok')}</div>
        </div>
        ${items.length ? `
          <div class="v85-task-list">
            ${items.map((task) => `
              <div class="v85-task-row">
                <div>
                  <strong>${escapeHtml(String(task.title || '').replace(/^.*?:\s*/, ''))}</strong>
                  <div class="muted small">${escapeHtml(task.owner || '—')} · ${task.due ? fmt.date(task.due) : 'без срока'}</div>
                  ${task.reason ? `<div class="muted small">${escapeHtml(task.reason)}</div>` : ''}
                </div>
                <div class="v85-task-actions">
                  <select class="inline-select" data-v85-task-status="${escapeHtml(task.id)}">${Object.entries(TASK_STATUS_META).map(([value, meta]) => `<option value="${value}" ${task.status === value ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
                </div>
              </div>`).join('')}
          </div>` : '<div class="empty">В этой фазе задачи пока не созданы.</div>'}
      </div>`).join('');
  }

  function detailsPanel(launch) {
    if (!launch) return `<div class="card"><div class="empty">Нет запусков под текущий фильтр.</div></div>`;
    const statusMeta = STATUS_META[launch.derivedStatus] || STATUS_META.not_started;
    return `
      <div class="card v85-detail-card">
        <div class="head">
          <div>
            <h3>${escapeHtml(launch.noveltyName)}</h3>
            <div class="muted small">${escapeHtml(launch.articleKey || '—')} · ${escapeHtml((launch.marketplace || 'wb').toUpperCase())}</div>
          </div>
          <div class="badge-stack">${badge(statusMeta.label, statusMeta.kind)}${launch.combinedRisk ? badge('Риск', 'danger') : badge('ОК', 'ok')}</div>
        </div>
        <form id="v85LaunchForm" class="form-grid compact" data-v85-launch-form="${escapeHtml(launch.id)}">
          <label><span>Owner запуска</span><select name="ownerName">${ownerOptions().map((owner) => `<option value="${escapeHtml(owner)}" ${owner === launch.ownerName ? 'selected' : ''}>${escapeHtml(owner)}</option>`).join('')}</select></label>
          <label><span>Маркетплейс</span><select name="marketplace"><option value="wb" ${launch.marketplace==='wb'?'selected':''}>WB</option><option value="ozon" ${launch.marketplace==='ozon'?'selected':''}>ОЗ</option><option value="ym" ${launch.marketplace==='ym'?'selected':''}>ЯМ</option></select></label>
          <label><span>Статус запуска</span><select name="launchStatus">${Object.entries(STATUS_META).map(([value, meta]) => `<option value="${value}" ${value === launch.launchStatus ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select></label>
          <label><span>Текущая фаза</span><select name="currentPhase">${PHASES.map((phase) => `<option value="${phase.key}" ${phase.key === launch.currentPhase ? 'selected' : ''}>${escapeHtml(phase.label)}</option>`).join('')}</select></label>
          <label><span>План запуска (месяц)</span><input name="launchPlanMonth" value="${escapeHtml(launch.launchPlanMonth || '')}" placeholder="Май 2026"></label>
          <label><span>Факт запуска (месяц)</span><input name="launchFactMonth" value="${escapeHtml(launch.launchFactMonth || '')}" placeholder="Май 2026"></label>
          <label><span>Плановая дата</span><input type="date" name="launchPlanDate" value="${escapeHtml(String(launch.launchPlanDate || '').slice(0, 10))}"></label>
          <label><span>Фактическая дата</span><input type="date" name="launchFactDate" value="${escapeHtml(String(launch.launchFactDate || '').slice(0, 10))}"></label>
          <label class="toggle"><input type="checkbox" name="riskFlag" ${launch.riskFlag ? 'checked' : ''}> Есть серьёзный риск</label>
          <label class="wide"><span>Блокер</span><textarea name="blocker" rows="2">${escapeHtml(launch.blocker || '')}</textarea></label>
          <label class="wide"><span>Следующий шаг</span><textarea name="nextStep" rows="2">${escapeHtml(launch.nextStep || '')}</textarea></label>
          <label class="wide"><span>Комментарий / заметки</span><textarea name="notes" rows="2">${escapeHtml(launch.notes || '')}</textarea></label>
          <div class="wide v85-actions-row">
            <button class="btn" type="submit">Сохранить запуск</button>
            <button class="btn ghost" type="button" data-v85-create-checklist="${escapeHtml(launch.id)}">${launch.total ? 'Обновить чек-лист' : 'Создать чек-лист'}</button>
            <button class="btn ghost" type="button" data-v85-open-product="${escapeHtml(launch.id)}">Открыть у Ксении</button>
          </div>
        </form>
      </div>
      <div class="card">
        <div class="section-subhead">
          <div><h3>Чек-лист запуска</h3><p class="small muted">3 фазы запуска и контроль просрочек. Это явный рабочий контур Маши вместо отдельного Excel.</p></div>
          <div class="badge-stack">${badge(`Прогресс ${fmt.int(launch.progressPct)}%`, launch.progressPct === 100 ? 'ok' : 'info')}${badge(`Просрочено ${fmt.int(launch.overdue)}`, launch.overdue ? 'danger' : 'ok')}</div>
        </div>
        <div class="v85-phase-grid">${phaseBoard(launch)}</div>
      </div>`;
  }

  function renderLaunchControl() {
    ensureDom();
    ensureLaunchStoreSeeded();
    const root = document.getElementById('view-launch-control');
    if (!root) return;
    const rows = launchRows();
    const allRows = mergeLaunches(seedLaunchesFromNovelties(), state.v85.launches || [], []);
    if (!rows.find((row) => row.id === state.v85.ui.selectedLaunchId)) state.v85.ui.selectedLaunchId = rows[0]?.id || '';
    const selected = selectedLaunch(rows);
    const ownerOpts = ownerOptions();
    const planMonths = Array.from(new Set(allRows.map((row) => row.launchPlanMonth).filter(Boolean))).sort();

    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Запуск новинок</h2>
          <p>Отдельный рабочий контур для Маши: реестр запусков, фазы, чек-листы, просрочки, блокеры и next step. Здесь контролируем сам выход новинок, а не продуктовую экономику.</p>
        </div>
      </div>
      <div class="footer-note">${badge(state.v85.remote.error ? state.v85.remote.note || 'Локально' : state.v85.remote.note || 'Локальный запуск новинок', state.v85.remote.error ? 'danger' : hasRemoteStore() ? 'ok' : '')}</div>
      ${summaryCards(rows)}
      <div class="card">
        <div class="v85-filter-row">
          <input id="v85LaunchSearch" placeholder="Поиск по новинке / SKU / owner" value="${escapeHtml(state.v85.filters.search)}">
          <select id="v85LaunchMarketplace"><option value="all">Все MP</option><option value="wb" ${state.v85.filters.marketplace==='wb'?'selected':''}>WB</option><option value="ozon" ${state.v85.filters.marketplace==='ozon'?'selected':''}>ОЗ</option><option value="ym" ${state.v85.filters.marketplace==='ym'?'selected':''}>ЯМ</option></select>
          <select id="v85LaunchOwner"><option value="all">Все owner</option>${ownerOpts.map((owner) => `<option value="${escapeHtml(owner)}" ${owner===state.v85.filters.owner?'selected':''}>${escapeHtml(owner)}</option>`).join('')}</select>
          <select id="v85LaunchPlanMonth"><option value="all">План запуска: все</option>${planMonths.map((month) => `<option value="${escapeHtml(month)}" ${month===state.v85.filters.planMonth?'selected':''}>${escapeHtml(month)}</option>`).join('')}</select>
          <select id="v85LaunchStatus"><option value="all">Все статусы</option>${Object.entries(STATUS_META).map(([value, meta]) => `<option value="${value}" ${value===state.v85.filters.status?'selected':''}>${escapeHtml(meta.label)}</option>`).join('')}</select>
          <label class="toggle"><input id="v85LaunchRiskOnly" type="checkbox" ${state.v85.filters.riskOnly ? 'checked' : ''}> Только риск</label>
          <label class="toggle"><input id="v85LaunchOverdueOnly" type="checkbox" ${state.v85.filters.overdueOnly ? 'checked' : ''}> Только просрочка</label>
        </div>
      </div>
      <div class="v85-launch-layout">
        <div class="card v85-registry-card">
          <div class="section-subhead">
            <div><h3>Реестр запусков</h3><p class="small muted">Одна строка = одна новинка / один запуск.</p></div>
          </div>
          <div class="table-wrap">
            <table class="v85-launch-table">
              <thead><tr><th>Новинка</th><th>Owner</th><th>MP</th><th>План</th><th>Факт</th><th>Delay</th><th>Фаза</th><th>Прогресс</th><th>Проср.</th><th>Риск</th><th>Следующий шаг</th></tr></thead>
              <tbody>
                ${rows.length ? rows.map((row) => `
                  <tr class="${row.id === selected?.id ? 'selected' : ''}" data-v85-select-launch="${escapeHtml(row.id)}">
                    <td><strong>${escapeHtml(row.noveltyName)}</strong><div class="muted small">${escapeHtml(row.articleKey || '—')}</div></td>
                    <td>${escapeHtml(row.ownerName || '—')}</td>
                    <td>${escapeHtml((row.marketplace || 'wb').toUpperCase())}</td>
                    <td>${escapeHtml(row.launchPlanMonth || '—')}</td>
                    <td>${escapeHtml(row.launchFactMonth || '—')}</td>
                    <td>${row.delayMonths == null ? '—' : fmt.int(row.delayMonths)}</td>
                    <td>${badge(PHASES.find((phase) => phase.key === row.derivedPhase)?.label || row.derivedPhase, row.derivedPhase === 'active' ? 'warn' : row.derivedPhase === 'growth' ? 'ok' : 'info')}</td>
                    <td>${fmt.int(row.progressPct)}%</td>
                    <td>${row.overdue ? badge(fmt.int(row.overdue), 'danger') : badge('0', 'ok')}</td>
                    <td>${row.combinedRisk ? badge('Риск', 'danger') : badge('ОК', 'ok')}</td>
                    <td class="muted small">${escapeHtml(row.nextStep || '—')}</td>
                  </tr>`).join('') : '<tr><td colspan="11" class="text-center muted">Нет запусков под текущий фильтр</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        <div class="v85-detail-column">${detailsPanel(selected)}</div>
      </div>`;

    const on = (selector, event, handler) => root.querySelector(selector)?.addEventListener(event, handler);
    on('#v85LaunchSearch', 'input', (e) => { state.v85.filters.search = e.target.value; renderLaunchControl(); });
    on('#v85LaunchMarketplace', 'change', (e) => { state.v85.filters.marketplace = e.target.value; renderLaunchControl(); });
    on('#v85LaunchOwner', 'change', (e) => { state.v85.filters.owner = e.target.value; renderLaunchControl(); });
    on('#v85LaunchPlanMonth', 'change', (e) => { state.v85.filters.planMonth = e.target.value; renderLaunchControl(); });
    on('#v85LaunchStatus', 'change', (e) => { state.v85.filters.status = e.target.value; renderLaunchControl(); });
    on('#v85LaunchRiskOnly', 'change', (e) => { state.v85.filters.riskOnly = e.target.checked; renderLaunchControl(); });
    on('#v85LaunchOverdueOnly', 'change', (e) => { state.v85.filters.overdueOnly = e.target.checked; renderLaunchControl(); });

    root.querySelectorAll('[data-v85-select-launch]').forEach((rowEl) => rowEl.addEventListener('click', () => {
      state.v85.ui.selectedLaunchId = rowEl.dataset.v85SelectLaunch;
      renderLaunchControl();
    }));

    root.querySelector('[data-v85-launch-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const id = event.currentTarget.dataset.v85LaunchForm;
      const idx = state.v85.launches.findIndex((item) => item.id === id);
      if (idx < 0) return;
      state.v85.launches[idx] = normalizeLaunchRecord({
        ...state.v85.launches[idx],
        ownerName: form.get('ownerName'),
        marketplace: form.get('marketplace'),
        launchPlanMonth: form.get('launchPlanMonth'),
        launchFactMonth: form.get('launchFactMonth'),
        launchPlanDate: form.get('launchPlanDate'),
        launchFactDate: form.get('launchFactDate'),
        launchStatus: form.get('launchStatus'),
        currentPhase: form.get('currentPhase'),
        riskFlag: form.get('riskFlag') === 'on',
        blocker: form.get('blocker'),
        nextStep: form.get('nextStep'),
        notes: form.get('notes'),
        updatedAt: new Date().toISOString()
      });
      saveLaunchStore();
      try { await pushRemoteLaunches(); } catch (error) { console.error(error); }
      renderLaunchControl();
    });

    root.querySelector('[data-v85-create-checklist]')?.addEventListener('click', async (event) => {
      const launch = rows.find((row) => row.id === event.currentTarget.dataset.v85CreateChecklist) || state.v85.launches.find((row) => row.id === event.currentTarget.dataset.v85CreateChecklist);
      if (!launch) return;
      await ensureChecklist(launch);
    });

    root.querySelector('[data-v85-open-product]')?.addEventListener('click', (event) => {
      const launch = state.v85.launches.find((row) => row.id === event.currentTarget.dataset.v85OpenProduct);
      if (!launch) return;
      try {
        if (state.v80?.filters) state.v80.filters.noveltySearch = launch.noveltyName || launch.articleKey || '';
      } catch (error) {
        console.error(error);
      }
      setView('launches');
    });

    root.querySelectorAll('[data-v85-task-status]').forEach((select) => select.addEventListener('change', async () => {
      await updateTaskStatus(select.dataset.v85TaskStatus, select.value);
      renderLaunchControl();
    }));
  }

  function boot() {
    ensureDom();
    loadLaunchStore();
    ensureLaunchStoreSeeded();
    setTimeout(() => { pullRemoteLaunches(false).catch(console.error); }, 800);
  }

  const prevRenderLaunches = renderLaunches;
  renderLaunches = function () {
    prevRenderLaunches();
    try { lightenProductView(); } catch (error) { console.error(error); }
  };

  const prevRerender = rerenderCurrentView;
  rerenderCurrentView = function () {
    prevRerender();
    try { renderLaunchControl(); } catch (error) {
      console.error(error);
      renderViewFailure('view-launch-control', 'Запуск новинок', error);
      setAppError(`Портал загрузил не всё: Запуск новинок — ${error.message}`);
    }
  };

  const prevPullRemoteState = pullRemoteState;
  pullRemoteState = async function (rerender = true) {
    await prevPullRemoteState(false);
    await pullRemoteLaunches(false);
    if (rerender) {
      rerenderCurrentView();
      if (state.activeSku) renderSkuModal(state.activeSku);
    }
  };

  const prevPushRemoteState = pushStateToRemote;
  pushStateToRemote = async function () {
    await prevPushRemoteState();
    await pushRemoteLaunches();
    rerenderCurrentView();
    if (state.activeSku) renderSkuModal(state.activeSku);
  };

  boot();
})();
