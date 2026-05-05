(function () {
  if (window.__ALTEA_PORTAL_HOTFIX_20260417G__) return;
  window.__ALTEA_PORTAL_HOTFIX_20260417G__ = true;

  const DATA_VERSION = '20260417g';
  const STYLE_ID = 'altea-hotfix-styles-20260417g';
  const FALLBACKS = {
    dashboard: { cards: [], brandSummary: [], generatedAt: '' },
    skus: [],
    launches: [],
    meetings: [],
    documents: { groups: [] },
    repricer: { generatedAt: '', summary: {}, rows: [], items: [] },
    seed: { comments: [], tasks: [], decisions: [], ownerOverrides: [] }
  };

  function ensureBoot() {
    if (typeof state !== 'object' || !state) return false;
    state.boot = state.boot || {};
    if (typeof state.boot.listenersAttached !== 'boolean') state.boot.listenersAttached = false;
    if (!Array.isArray(state.boot.dataWarnings)) state.boot.dataWarnings = [];
    return true;
  }

  function ensureImperialState() {
    if (typeof state !== 'object' || !state) return {};
    state.imperial = state.imperial || {};
    if (!state.imperial.targetDays) state.imperial.targetDays = 14;
    if (!state.imperial.riskPlatform) state.imperial.riskPlatform = 'all';
    if (!state.imperial.clusterFilter) state.imperial.clusterFilter = 'all';
    if (!state.imperial.warehouseFilter) state.imperial.warehouseFilter = 'all';
    return state.imperial;
  }

  function clone(value) {
    if (value === null || value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function addWarning(message) {
    if (!ensureBoot() || !message) return;
    if (!state.boot.dataWarnings.includes(message)) state.boot.dataWarnings.push(message);
  }

  function toNumber(value) {
    if (typeof numberOrZero === 'function') return numberOrZero(value);
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return 0;
    return Number(value);
  }

  function average(values) {
    const numbers = values.map(toNumber).filter((value) => Number.isFinite(value));
    if (!numbers.length) return 0;
    return numbers.reduce((acc, value) => acc + value, 0) / numbers.length;
  }

  function parseIsoDate(value) {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatRuDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  }

  function uniq(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function isBoundary(char) {
    return char === undefined || /[\s,\]\[}{:]/.test(char);
  }

  function sanitizeLooseJson(text) {
    if (!text || typeof text !== 'string') return text;
    const replacements = [
      ['-Infinity', 'null'],
      ['Infinity', 'null'],
      ['NaN', 'null'],
      ['undefined', 'null']
    ];
    let result = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (inString) {
        result += char;
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }

      if (char === '"') {
        inString = true;
        result += char;
        continue;
      }

      let matched = false;
      for (const [token, replacement] of replacements) {
        if (
          text.startsWith(token, i) &&
          isBoundary(text[i - 1]) &&
          isBoundary(text[i + token.length])
        ) {
          result += replacement;
          i += token.length - 1;
          matched = true;
          break;
        }
      }

      if (!matched) result += char;
    }

    return result;
  }

  async function safeLoadJson(path) {
    const resolvedPath = path.includes('?') ? path : `${path}?v=${DATA_VERSION}`;
    const response = await fetch(resolvedPath, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (error) {
      const sanitized = sanitizeLooseJson(text);
      if (sanitized === text) throw error;
      console.warn(`JSON sanitized for ${path}: invalid numeric tokens were replaced with null.`);
      addWarning(`Файл ${path} был загружен с исправлениями из-за невалидных чисел.`);
      return JSON.parse(sanitized);
    }
  }

  async function loadJsonOrFallback(path, fallback, label) {
    try {
      return await safeLoadJson(path);
    } catch (error) {
      console.error(error);
      addWarning(`${label}: ${error.message || 'ошибка загрузки'}`);
      return clone(fallback);
    }
  }

  function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} превысил ${Math.round(ms / 1000)} сек.`)), ms);
      Promise.resolve(promise)
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  function patchListeners() {
    if (typeof attachGlobalListeners !== 'function') return;
    const original = attachGlobalListeners;
    attachGlobalListeners = function patchedAttachGlobalListeners() {
      if (!ensureBoot()) return original.apply(this, arguments);
      if (state.boot.listenersAttached) return;
      state.boot.listenersAttached = true;
      return original.apply(this, arguments);
    };
  }

  function setTeamError(error, note) {
    if (typeof state !== 'object' || !state?.team) return;
    state.team.mode = 'error';
    state.team.error = error || state.team.error || 'Не удалось подключиться к Supabase';
    state.team.note = note || 'Ошибка Supabase, работаем локально';
    if (typeof updateSyncBadge === 'function') updateSyncBadge();
  }

  const baseSetTeamError = setTeamError;
  setTeamError = function patchedSetTeamError(error, note) {
    if (typeof state !== 'object' || !state?.team) return baseSetTeamError(error, note);
    state.team.mode = 'local';
    state.team.ready = false;
    state.team.error = error || state.team.error || 'Командная база недоступна';
    state.team.note = note || 'Локальный режим · командная база недоступна';
    if (note && !/Ошибка|Supabase/i.test(String(note))) state.team.note = note;
    else state.team.note = 'Локальный режим · командная база недоступна';
    if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
    if (typeof updateSyncBadge === 'function') updateSyncBadge();
  };

  function normalizeTeamBadge() {
    if (typeof state !== 'object' || !state?.team) return;
    const note = String(state.team.note || '');
    if (
      state.team.mode === 'error' ||
      /Ошибка загрузки из Supabase|Ошибка выгрузки в Supabase|Ошибка Supabase/i.test(note)
    ) {
      setTeamError(state.team.error || 'Командная база недоступна');
    }
  }

  function scheduleTeamBadgeHealing() {
    [300, 1200, 3600, 9000, 15000].forEach((delay) => {
      window.setTimeout(() => {
        try {
          normalizeTeamBadge();
        } catch (error) {
          console.error('[portal-hotfix] team badge', error);
        }
      }, delay);
    });
  }

  function patchSupabaseTimeouts() {
    // Старый watchdog слишком агрессивно переводил портал в local mode,
    // хотя Supabase еще продолжал подключаться. Оставляем только log.
    window.__ALTEA_SUPABASE_TIMEOUT_PATCH_DISABLED__ = true;
  }

  function buildTaskComposerHtml() {
    const owners = typeof ownerOptions === 'function' ? ownerOptions() : [];
    const taskTypes = typeof TASK_TYPE_META === 'object' && TASK_TYPE_META ? TASK_TYPE_META : {};
    const priorities = typeof PRIORITY_META === 'object' && PRIORITY_META ? PRIORITY_META : {};
    const skuOptions = (Array.isArray(state.skus) ? state.skus : [])
      .slice()
      .sort((a, b) => String(a.article || a.articleKey || '').localeCompare(String(b.article || b.articleKey || ''), 'ru'))
      .map((sku) => {
        const label = sku.article || sku.articleKey || 'SKU';
        const name = sku.name ? ` · ${sku.name}` : '';
        return `<option value="${escapeHtml(label)}">${escapeHtml(`${label}${name}`)}</option>`;
      }).join('');
    const ownerOptionsHtml = owners.map((owner) => `<option value="${escapeHtml(owner)}"></option>`).join('');

    return `
      <div class="card" data-hotfix-task-composer>
        <div class="section-subhead">
          <div>
            <h3>Поставить задачу</h3>
            <p class="small muted">Быстрая постановка задачи прямо из задачника, без перехода в карточку SKU.</p>
          </div>
          ${typeof badge === 'function' ? badge('hotfix', 'info') : ''}
        </div>
        <form id="hotfixTaskComposer" class="form-grid compact" style="margin-top:12px">
          <input list="hotfixSkuList" name="articleKey" placeholder="Артикул / SKU" required>
          <datalist id="hotfixSkuList">${skuOptions}</datalist>
          <input name="title" placeholder="Что делаем" required>
          <select name="type">${Object.entries(taskTypes).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('')}</select>
          <select name="priority">${Object.entries(priorities).map(([value, meta]) => `<option value="${value}">${escapeHtml(meta.label)}</option>`).join('')}</select>
          <input name="owner" list="hotfixOwnerOptionsList" placeholder="Owner / кто делает">
          <datalist id="hotfixOwnerOptionsList">${ownerOptionsHtml}</datalist>
          <input name="due" type="date" value="${typeof plusDays === 'function' ? plusDays(3) : ''}">
          <input name="nextAction" placeholder="Следующее действие / комментарий">
          <button class="btn" type="submit">Создать задачу</button>
        </form>
        <div class="muted small" style="margin-top:8px">Если введённый артикул совпадает с SKU в портале, задача сразу привяжется к карточке.</div>
      </div>
    `;
  }

  function installControlComposer() {
    if (window.__ALTEA_CONTROL_CENTER_V2__) return;
    if (typeof renderControlCenter !== 'function' || typeof createManualTask !== 'function') return;
    const original = renderControlCenter;
    renderControlCenter = function patchedRenderControlCenter() {
      original.apply(this, arguments);
      const root = document.getElementById('view-control');
      if (!root || root.querySelector('[data-hotfix-task-composer]')) return;
      const filters = root.querySelector('.control-filters');
      if (filters) filters.insertAdjacentHTML('afterend', buildTaskComposerHtml());
      else root.insertAdjacentHTML('afterbegin', buildTaskComposerHtml());

      const form = root.querySelector('#hotfixTaskComposer');
      if (!form) return;
      if (!form.querySelector('select[name="platform"]')) {
        const platformSelect = document.createElement('select');
        platformSelect.name = 'platform';
        platformSelect.innerHTML = [
          '<option value="cross">Общий контур</option>',
          '<option value="ozon">РОП Ozon</option>',
          '<option value="wb">РОП WB</option>',
          '<option value="retail">ЯМ / Летуаль / Магнит / ЗЯ</option>'
        ].join('');
        const priorityField = form.querySelector('select[name="priority"]');
        const ownerField = form.querySelector('input[name="owner"]');
        if (priorityField) priorityField.insertAdjacentElement('afterend', platformSelect);
        else if (ownerField) form.insertBefore(platformSelect, ownerField);
        else form.appendChild(platformSelect);
      }
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const rawArticle = String(data.get('articleKey') || '').trim();
        const matchedSku = (Array.isArray(state.skus) ? state.skus : []).find((sku) => {
          const article = String(sku.article || '').trim();
          const key = String(sku.articleKey || '').trim();
          return rawArticle === article || rawArticle === key;
        });
        const articleKey = matchedSku?.articleKey || rawArticle;
        if (!articleKey) return;
        await createManualTask({
          articleKey,
          title: String(data.get('title') || '').trim(),
          type: String(data.get('type') || 'general'),
          priority: String(data.get('priority') || 'medium'),
          platform: String(data.get('platform') || 'cross'),
          owner: String(data.get('owner') || '').trim(),
          due: String(data.get('due') || '').trim(),
          nextAction: String(data.get('nextAction') || '').trim()
        });
        form.reset();
        const dueInput = form.querySelector('input[name="due"]');
        if (dueInput && typeof plusDays === 'function') dueInput.value = plusDays(3);
        if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
        if (typeof setAppError === 'function') setAppError('Задача добавлена в рабочий контур.');
        window.setTimeout(() => {
          if (typeof setAppError === 'function' && !(state.runtimeErrors || []).length) setAppError('');
        }, 1800);
      });
    };
  }

  function injectHotfixStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .hotfix-platform-execution {
        margin-top: 18px;
        padding: 18px;
      }
      .hotfix-platform-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin-top: 14px;
      }
      .hotfix-platform-card {
        border: 1px solid rgba(212, 164, 74, 0.14);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(23, 17, 12, 0.94), rgba(12, 10, 9, 0.96));
        padding: 14px;
      }
      .hotfix-platform-card.hotfix-danger {
        border-color: rgba(203, 88, 65, 0.45);
      }
      .hotfix-platform-card.hotfix-warn {
        border-color: rgba(212, 164, 74, 0.45);
      }
      .hotfix-platform-card.hotfix-ok {
        border-color: rgba(118, 180, 121, 0.4);
      }
      .hotfix-platform-metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-top: 12px;
      }
      .hotfix-platform-metric {
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.025);
        border: 1px solid rgba(255, 255, 255, 0.045);
      }
      .hotfix-platform-metric span,
      .hotfix-filter span {
        display: block;
        color: rgba(255, 244, 229, 0.62);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 6px;
      }
      .hotfix-platform-metric strong {
        display: block;
        font-size: 24px;
        line-height: 1.1;
      }
      .hotfix-platform-foot {
        margin-top: 10px;
        display: flex;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .hotfix-logistics-section {
        margin-top: 18px;
      }
      .hotfix-logistics-ops-grid {
        display: grid;
        grid-template-columns: 1.2fr 1.2fr 1fr;
        gap: 12px;
        margin-top: 14px;
      }
      .hotfix-logistics-stack {
        display: grid;
        gap: 14px;
        margin-top: 14px;
      }
      .hotfix-logistics-filters {
        display: grid;
        grid-template-columns: minmax(180px, 260px) minmax(180px, 320px) auto 1fr;
        gap: 12px;
        align-items: end;
        margin-top: 14px;
      }
      .hotfix-filter select {
        width: 100%;
        border-radius: 12px;
        border: 1px solid rgba(212, 164, 74, 0.18);
        background: rgba(17, 14, 11, 0.96);
        color: #fff1dd;
        padding: 10px 12px;
      }
      .hotfix-inline-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
      }
      .hotfix-table-card .table-wrap {
        margin-top: 12px;
      }
      .hotfix-table-meta {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }
      .hotfix-table-caption {
        margin-top: 8px;
        color: rgba(255, 244, 229, 0.55);
        font-size: 12px;
      }
      @media (max-width: 1320px) {
        .hotfix-logistics-ops-grid {
          grid-template-columns: 1fr;
        }
        .hotfix-logistics-filters {
          grid-template-columns: 1fr 1fr;
        }
        .hotfix-inline-actions {
          justify-content: flex-start;
        }
      }
      @media (max-width: 900px) {
        .hotfix-platform-metrics {
          grid-template-columns: 1fr;
        }
        .hotfix-logistics-filters {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function getPlatformSeries(key) {
    const platforms = Array.isArray(state.platformTrends?.platforms) ? state.platformTrends.platforms : [];
    return platforms.find((item) => item.key === key) || null;
  }

  function getHotfixTone(pct) {
    if (pct >= 1) return 'hotfix-ok';
    if (pct >= 0.85) return 'hotfix-warn';
    return 'hotfix-danger';
  }

  function pickHotfixNumber(summary, keys) {
    for (const key of keys) {
      const value = summary?.[key];
      if (value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))) {
        return Number(value);
      }
    }
    return 0;
  }

  function buildPlatformExecutionModel() {
    const summary = state.dashboard?.brandSummary?.[0] || {};
    const monthPlanUnits = pickHotfixNumber(summary, ['plan_units', 'apr_plan_units', 'feb_plan_units']);
    const overallToDatePct = pickHotfixNumber(summary, ['plan_completion_to_date_pct', 'apr_plan_completion_to_date_pct', 'plan_completion_feb26_pct']);
    const asOfDate = parseIsoDate(state.dashboard?.dataFreshness?.asOfDate) || parseIsoDate(state.dashboard?.generatedAt);
    const today = new Date();
    const monthRef = asOfDate || today;
    const monthDays = new Date(monthRef.getFullYear(), monthRef.getMonth() + 1, 0).getDate();
    const dailyPlanBase = monthPlanUnits > 0 && monthDays > 0 ? monthPlanUnits / monthDays : 0;

    const detailedPlatforms = ['wb', 'ozon', 'ya']
      .map((key) => getPlatformSeries(key))
      .filter(Boolean);
    const totalRecentUnits = detailedPlatforms.reduce((acc, item) => {
      return acc + item.series.reduce((sum, point) => sum + toNumber(point?.units), 0);
    }, 0);

    const cards = [];
    const allPlatform = getPlatformSeries('all');
    if (allPlatform?.series?.length && dailyPlanBase > 0) {
      const latest = allPlatform.series[allPlatform.series.length - 1];
      const trailing = average(allPlatform.series.slice(-3).map((point) => point?.units));
      const pct = dailyPlanBase > 0 ? toNumber(latest?.units) / dailyPlanBase : 0;
      cards.push({
        key: 'all',
        label: 'Все площадки',
        tone: getHotfixTone(pct),
        targetUnits: dailyPlanBase,
        factUnits: toNumber(latest?.units),
        trailingUnits: trailing,
        share: 1,
        pct
      });
    }

    for (const item of detailedPlatforms) {
      const totalUnits = item.series.reduce((acc, point) => acc + toNumber(point?.units), 0);
      const share = totalRecentUnits > 0 ? totalUnits / totalRecentUnits : 0;
      const latest = item.series[item.series.length - 1];
      const targetUnits = dailyPlanBase * share;
      const trailing = average(item.series.slice(-3).map((point) => point?.units));
      const pct = targetUnits > 0 ? toNumber(latest?.units) / targetUnits : 0;
      cards.push({
        key: item.key,
        label: item.label || item.key.toUpperCase(),
        tone: getHotfixTone(pct),
        targetUnits,
        factUnits: toNumber(latest?.units),
        trailingUnits: trailing,
        share,
        pct
      });
    }

    return {
      cards,
      monthLabel: monthRef.toLocaleString('ru-RU', { month: 'long', year: 'numeric' }),
      todayLabel: formatRuDate(today),
      asOfLabel: formatRuDate(asOfDate || today),
      overallToDatePct
    };
  }

  function renderPlatformExecutionSection() {
    const model = buildPlatformExecutionModel();
    if (!model.cards.length) return '';
    const cardsHtml = model.cards.map((card) => `
      <div class="hotfix-platform-card ${card.tone}">
        <div class="section-subhead">
          <div>
            <h3>${escapeHtml(card.label)}</h3>
            <p class="small muted">План на ${escapeHtml(model.todayLabel)} · факт последнего доступного дня ${escapeHtml(model.asOfLabel)}</p>
          </div>
          ${badge(fmt.pct(card.pct), card.pct >= 1 ? 'ok' : (card.pct >= 0.85 ? 'warn' : 'danger'))}
        </div>
        <div class="hotfix-platform-metrics">
          <div class="hotfix-platform-metric">
            <span>План дня</span>
            <strong>${escapeHtml(fmt.int(card.targetUnits))}</strong>
          </div>
          <div class="hotfix-platform-metric">
            <span>Факт D-1</span>
            <strong>${escapeHtml(fmt.int(card.factUnits))}</strong>
          </div>
          <div class="hotfix-platform-metric">
            <span>Среднее 3 дня</span>
            <strong>${escapeHtml(fmt.int(card.trailingUnits))}</strong>
          </div>
        </div>
        <div class="hotfix-platform-foot muted small">
          <span>Доля в операционном миксе: ${escapeHtml(fmt.pct(card.share))}</span>
          <span>Темп к дневному плану: ${escapeHtml(fmt.pct(card.pct))}</span>
        </div>
      </div>
    `).join('');

    return `
      <section class="card hotfix-platform-execution" data-hotfix-platform-execution>
        <div class="section-subhead">
          <div>
            <h3>Выполнение площадок на текущий день</h3>
            <p class="small muted">Линейный план дня на ${escapeHtml(model.todayLabel)}. Последний доступный факт в данных портала: ${escapeHtml(model.asOfLabel)}.</p>
          </div>
          <div class="badge-stack">
            ${badge(`Месяц: ${model.monthLabel}`, 'info')}
            ${badge(`К дате: ${fmt.pct(model.overallToDatePct)}`, model.overallToDatePct >= 1 ? 'ok' : (model.overallToDatePct >= 0.85 ? 'warn' : 'danger'))}
          </div>
        </div>
        <div class="hotfix-platform-grid">${cardsHtml}</div>
      </section>
    `;
  }

  function installDashboardEnhancer() {
    if (window.__ALTEA_OPTIMIZED_RENDER__) return;
    if (typeof renderDashboard !== 'function') return;
    const original = renderDashboard;
    renderDashboard = function patchedRenderDashboard() {
      original.apply(this, arguments);
      injectHotfixStyles();
      const root = document.getElementById('view-dashboard');
      if (!root) return;
      root.querySelector('[data-hotfix-platform-execution]')?.remove();
      const hero = root.querySelector('.hero-panel');
      const html = renderPlatformExecutionSection();
      if (!html) return;
      if (hero) hero.insertAdjacentHTML('afterend', html);
      else root.insertAdjacentHTML('afterbegin', html);
    };
  }

  function getNeedForTarget(row, targetDays) {
    return toNumber(row?.[`targetNeed${targetDays}`]);
  }

  function turnoverBadgeHotfix(days) {
    if (days === null || days === undefined || Number.isNaN(Number(days))) return badge('Покрытие —');
    const value = Number(days);
    if (value < 7) return badge(`${fmt.num(value, 1)} дн.`, 'danger');
    if (value < 14) return badge(`${fmt.num(value, 1)} дн.`, 'warn');
    return badge(`${fmt.num(value, 1)} дн.`, 'ok');
  }

  function renderNoRows(colspan, text) {
    return `<tr><td colspan="${colspan}" class="text-center muted">${escapeHtml(text)}</td></tr>`;
  }

  function renderLogisticsRows(rows, mode, targetDays) {
    if (!rows.length) {
      if (mode === 'status') return renderNoRows(3, 'Нет строк под текущий фильтр');
      if (mode === 'backlog') return renderNoRows(5, 'Нет backlog по текущему фильтру');
      if (mode === 'central') return renderNoRows(2, 'Нет данных центрального склада');
      if (mode === 'cluster' || mode === 'warehouse-ozon') return renderNoRows(9, 'Нет строк под текущий фильтр');
      if (mode === 'warehouse-wb') return renderNoRows(8, 'Нет строк под текущий фильтр');
      return renderNoRows(10, 'Нет строк под текущий фильтр');
    }

    if (mode === 'status') {
      return rows.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.label || 'Статус')}</strong></td>
          <td>${fmt.int(row.orders)}</td>
          <td>${fmt.int(row.units)}</td>
        </tr>
      `).join('');
    }

    if (mode === 'backlog') {
      return rows.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.cluster)}</strong></td>
          <td>${fmt.int(row.orders)}</td>
          <td>${fmt.int(row.units)}</td>
          <td>${badge(`сборка ${fmt.int(row.waitingAssembly)}`, toNumber(row.waitingAssembly) > 0 ? 'warn' : 'ok')}</td>
          <td>${badge(`отгрузка ${fmt.int(row.waitingShip)}`, toNumber(row.waitingShip) > 0 ? 'danger' : 'ok')}</td>
        </tr>
      `).join('');
    }

    if (mode === 'central') {
      return rows.map((row) => `
        <tr>
          <td>${escapeHtml(row.label)}</td>
          <td><strong>${escapeHtml(row.value)}</strong></td>
        </tr>
      `).join('');
    }

    if (mode === 'cluster') {
      return rows.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.name)}</strong></td>
          <td>${fmt.int(row.units)}</td>
          <td>${fmt.num(row.avgDailyUnits28, 1)}</td>
          <td>${fmt.int(row.available)}</td>
          <td>${fmt.int(row.inTransit)}</td>
          <td>${turnoverBadgeHotfix(row.coverageDays)}</td>
          <td>${badge(`need ${fmt.int(getNeedForTarget(row, targetDays))}`, getNeedForTarget(row, targetDays) > 0 ? 'danger' : 'ok')}</td>
          <td>${fmt.pct(row.localShare)}</td>
          <td>${fmt.int(row.skuCount)}</td>
        </tr>
      `).join('');
    }

    if (mode === 'warehouse-ozon') {
      return rows.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.warehouse)}</strong><div class="muted small">${escapeHtml(row.cluster || '—')}</div></td>
          <td>${fmt.int(row.units)}</td>
          <td>${fmt.num(row.avgDailyUnits28, 1)}</td>
          <td>${fmt.int(row.available)}</td>
          <td>${fmt.int(row.inTransit)}</td>
          <td>${turnoverBadgeHotfix(row.coverageDays)}</td>
          <td>${badge(`need ${fmt.int(getNeedForTarget(row, targetDays))}`, getNeedForTarget(row, targetDays) > 0 ? 'danger' : 'ok')}</td>
          <td>${fmt.pct(row.localShare)}</td>
          <td>${fmt.int(row.skuCount)}</td>
        </tr>
      `).join('');
    }

    if (mode === 'warehouse-wb') {
      return rows.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.name)}</strong></td>
          <td>${fmt.int(row.ordersUnits)}</td>
          <td>${fmt.num(row.avgDailyUnits, 1)}</td>
          <td>${fmt.int(row.stock)}</td>
          <td>${turnoverBadgeHotfix(row.coverageDays)}</td>
          <td>${badge(`need ${fmt.int(getNeedForTarget(row, targetDays))}`, getNeedForTarget(row, targetDays) > 0 ? 'danger' : 'ok')}</td>
          <td>${fmt.money(row.payout)}</td>
          <td>${fmt.int(row.skuCount)}</td>
        </tr>
      `).join('');
    }

    return rows.map((row) => `
      <tr>
        <td>${badge(row.platform, String(row.platform).toLowerCase() === 'ozon' ? 'info' : 'ok')}</td>
        <td><strong>${escapeHtml(row.place)}</strong></td>
        <td>${typeof linkToSku === 'function' ? linkToSku(row.article, row.article) : escapeHtml(row.article)}</td>
        <td>${escapeHtml(row.name || 'Без названия')}</td>
        <td>${escapeHtml(row.owner || 'Без owner')}</td>
        <td>${fmt.num(row.avgDaily, 1)}</td>
        <td>${fmt.int(row.inStock)}</td>
        <td>${fmt.int(row.inTransit)}</td>
        <td>${turnoverBadgeHotfix(row.turnoverDays)}</td>
        <td>${badge(`need ${fmt.int(getNeedForTarget(row, targetDays))}`, getNeedForTarget(row, targetDays) > 0 ? 'danger' : 'ok')}</td>
      </tr>
    `).join('');
  }

  function renderLogisticsTableCard(title, subtitle, rows, mode, headers, targetDays, metaHtml = '', caption = '') {
    return `
      <div class="card hotfix-table-card">
        <div class="section-subhead">
          <div>
            <h3>${escapeHtml(title)}</h3>
            <p class="small muted">${escapeHtml(subtitle)}</p>
          </div>
          <div class="hotfix-table-meta">${metaHtml}</div>
        </div>
        <div class="table-wrap imperial-table-wrap">
          <table>
            <thead>
              <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
            </thead>
            <tbody>${renderLogisticsRows(rows, mode, targetDays)}</tbody>
          </table>
        </div>
        ${caption ? `<div class="hotfix-table-caption">${escapeHtml(caption)}</div>` : ''}
      </div>
    `;
  }

  function buildWarehouseOptions(data) {
    const ozon = (data.ozonWarehouses || []).map((row) => ({ value: String(row.warehouse || ''), label: `Ozon · ${row.warehouse}` }));
    const wb = (data.wbWarehouses || []).map((row) => ({ value: String(row.name || ''), label: `WB · ${row.name}` }));
    return uniq([...ozon, ...wb].map((item) => JSON.stringify(item))).map((value) => JSON.parse(value));
  }

  function buildImperialLogisticsModel() {
    const data = state.logistics;
    const imperialState = ensureImperialState();
    const target = Number(imperialState.targetDays || 14);
    const riskPlatform = imperialState.riskPlatform || 'all';
    const clusterFilter = imperialState.clusterFilter || 'all';
    const warehouseFilter = imperialState.warehouseFilter || 'all';

    const selectedOzonWarehouse = (data.ozonWarehouses || []).find((row) => String(row.warehouse || '') === warehouseFilter) || null;
    const derivedCluster = selectedOzonWarehouse
      ? String(selectedOzonWarehouse.cluster || '')
      : (warehouseFilter !== 'all' ? '__none__' : 'all');
    const effectiveCluster = clusterFilter !== 'all' ? clusterFilter : derivedCluster;

    const clusterRows = (data.ozonClusters || [])
      .filter((row) => effectiveCluster === 'all' ? true : String(row.name || '') === effectiveCluster);

    const ozonWarehouseRows = (data.ozonWarehouses || [])
      .filter((row) => effectiveCluster === 'all' ? true : String(row.cluster || '') === effectiveCluster)
      .filter((row) => warehouseFilter === 'all' ? true : String(row.warehouse || '') === warehouseFilter);

    const wbWarehouseRows = (data.wbWarehouses || [])
      .filter((row) => warehouseFilter === 'all' ? true : String(row.name || '') === warehouseFilter);

    const riskRows = (data.riskRows || [])
      .filter((row) => riskPlatform === 'all' ? true : String(row.platform || '').toLowerCase() === riskPlatform)
      .filter((row) => getNeedForTarget(row, target) > 0 || toNumber(row.turnoverDays) < target)
      .filter((row) => {
        if (warehouseFilter !== 'all') return String(row.place || '') === warehouseFilter;
        if (clusterFilter !== 'all') return String(row.platform || '').toLowerCase() === 'ozon' && String(row.place || '') === clusterFilter;
        if (derivedCluster !== 'all' && derivedCluster !== '__none__') {
          return String(row.platform || '').toLowerCase() === 'ozon' && String(row.place || '') === derivedCluster;
        }
        return true;
      })
      .sort((a, b) => getNeedForTarget(b, target) - getNeedForTarget(a, target) || toNumber(a.turnoverDays || 999) - toNumber(b.turnoverDays || 999))
      .slice(0, 160);

    return {
      data,
      target,
      riskPlatform,
      clusterFilter,
      warehouseFilter,
      clusterRows,
      ozonWarehouseRows,
      wbWarehouseRows,
      riskRows,
      clusterOptions: uniq((data.ozonClusters || []).map((row) => String(row.name || ''))),
      warehouseOptions: buildWarehouseOptions(data)
    };
  }

  function renderImperialLogisticsSection() {
    if (!state.logistics) return '';
    const model = buildImperialLogisticsModel();
    const data = model.data;
    const summaryCardsHtml = (data.summaryCards || []).map((card) => `
      <div class="mini-kpi ${String(card.label).includes('Ожидает') || String(card.label).includes('<') ? 'warn' : ''}">
        <span>${escapeHtml(card.label)}</span>
        <strong>${card.valuePct != null ? fmt.pct(card.valuePct) : fmt.int(card.value)}</strong>
        <span>${escapeHtml(card.hint || '')}</span>
      </div>
    `).join('');

    const statusRows = (data.statusCards || []).slice(0, 12);
    const backlogRows = (data.backlogByCluster || []).slice(0, 16);
    const centralRows = [
      { label: 'Балашиха · остаток', value: `${fmt.int(data.centralWarehouse?.stock)} шт.` },
      { label: 'Отгружено Ozon', value: `${fmt.int(data.centralWarehouse?.shippedOzon)} шт.` },
      { label: 'Отгружено WB', value: `${fmt.int(data.centralWarehouse?.shippedWB)} шт.` },
      { label: 'SKU в центральном остатке', value: fmt.int(data.centralWarehouse?.skuCount) }
    ];
    const clusterOptionsHtml = model.clusterOptions.map((item) => `<option value="${escapeHtml(item)}"${model.clusterFilter === item ? ' selected' : ''}>${escapeHtml(item)}</option>`).join('');
    const warehouseOptionsHtml = model.warehouseOptions.map((item) => `<option value="${escapeHtml(item.value)}"${model.warehouseFilter === item.value ? ' selected' : ''}>${escapeHtml(item.label)}</option>`).join('');

    return `
      <section class="imperial-section hotfix-logistics-section" data-hotfix-logistics>
        <div class="section-title">
          <div>
            <h2>Логистика, кластера и заказ</h2>
            <p>Расширили слой для логистов: широкие таблицы по кластерам и складам, плюс фильтры, которые сразу сужают нужный маршрут пополнения.</p>
          </div>
          <div class="badge-stack">
            ${(data.targetOptions || [7, 14, 28]).map((days) => `<button class="quick-chip imperial-target ${model.target === days ? 'active' : ''}" type="button" data-hotfix-target="${days}">${days} дн.</button>`).join('')}
          </div>
        </div>

        <div class="kpi-strip imperial-kpi-strip">${summaryCardsHtml}</div>

        <div class="hotfix-logistics-ops-grid">
          ${renderLogisticsTableCard('Статус потока отгрузки', 'Сначала проверяем, где тормозит цепочка: сборка, отгрузка, доставка.', statusRows, 'status', ['Статус', 'Заказы', 'Шт.'], model.target, `${badge(`${data.window?.days || 28} дн.`, 'info')}`)}
          ${renderLogisticsTableCard('Backlog по кластерам', 'Сразу видно, в каком кластере зависли сборка и отгрузка.', backlogRows, 'backlog', ['Кластер', 'Заказы', 'Шт.', 'Сборка', 'Отгрузка'], model.target, `${badge(`${fmt.int(backlogRows.length)} строк`, backlogRows.length ? 'warn' : 'ok')}`)}
          ${renderLogisticsTableCard('Центральный склад', 'Короткий срез по Балашихе и отгрузкам в каналы.', centralRows, 'central', ['Показатель', 'Значение'], model.target, `${badge('центральный остаток', 'info')}`)}
        </div>

        <div class="card" style="margin-top:14px">
          <div class="section-subhead">
            <div>
              <h3>Фильтры по кластерам и складам</h3>
              <p class="small muted">Фильтр применяем ко всем широким таблицам ниже. Если выбран склад Ozon, автоматически сузим и кластерный слой.</p>
            </div>
            <div class="badge-stack">
              ${badge(`Платформа: ${model.riskPlatform === 'all' ? 'все' : model.riskPlatform.toUpperCase()}`, model.riskPlatform === 'all' ? 'info' : '')}
              ${badge(`Цель: ${model.target} дн.`, 'info')}
            </div>
          </div>
          <div class="hotfix-logistics-filters">
            <label class="hotfix-filter">
              <span>Кластер Ozon</span>
              <select id="hotfixImperialClusterFilter">
                <option value="all">Все кластера</option>
                ${clusterOptionsHtml}
              </select>
            </label>
            <label class="hotfix-filter">
              <span>Склад / точка</span>
              <select id="hotfixImperialWarehouseFilter">
                <option value="all">Все склады</option>
                ${warehouseOptionsHtml}
              </select>
            </label>
            <button class="quick-chip" type="button" data-hotfix-reset-filters>Сбросить фильтры</button>
            <div class="hotfix-inline-actions">
              <button class="quick-chip ${model.riskPlatform === 'all' ? 'active' : ''}" type="button" data-hotfix-risk-platform="all">Все</button>
              <button class="quick-chip ${model.riskPlatform === 'ozon' ? 'active' : ''}" type="button" data-hotfix-risk-platform="ozon">Ozon</button>
              <button class="quick-chip ${model.riskPlatform === 'wb' ? 'active' : ''}" type="button" data-hotfix-risk-platform="wb">WB</button>
            </div>
          </div>
        </div>

        <div class="hotfix-logistics-stack">
          ${renderLogisticsTableCard('Кластера Ozon', 'Продажи, покрытие, локальность и потребность на выбранную цель в полном формате.', model.clusterRows.slice(0, 40), 'cluster', ['Кластер', 'Заказы, шт.', 'Ср./день', 'Остаток', 'В пути', 'Покрытие', 'Need', 'Локальность', 'SKU'], model.target, `${badge(`${fmt.int(model.clusterRows.length)} строк`, model.clusterRows.length ? 'ok' : 'warn')}${badge(`цель ${model.target} дн.`, 'info')}`, 'Если выбран конкретный склад Ozon, таблица автоматически показывает связанный кластер.')}
          ${renderLogisticsTableCard('Склады Ozon', 'Где лежит остаток и где уже нужен подвоз по выбранному кластеру или складу.', model.ozonWarehouseRows.slice(0, 60), 'warehouse-ozon', ['Склад', 'Заказы, шт.', 'Ср./день', 'Остаток', 'В пути', 'Покрытие', 'Need', 'Локальность', 'SKU'], model.target, `${badge(`${fmt.int(model.ozonWarehouseRows.length)} строк`, model.ozonWarehouseRows.length ? 'ok' : 'warn')}${badge(`цель ${model.target} дн.`, 'info')}`)}
          ${renderLogisticsTableCard('Склады WB', 'Полный слой для логистов: склад, скорость продаж, покрытие и потребность по WB.', model.wbWarehouseRows.slice(0, 60), 'warehouse-wb', ['Склад', 'Заказы, шт.', 'Ср./день', 'Остаток', 'Покрытие', 'Need', 'Payout', 'SKU'], model.target, `${badge(`${fmt.int(model.wbWarehouseRows.length)} строк`, model.wbWarehouseRows.length ? 'ok' : 'warn')}${badge(`цель ${model.target} дн.`, 'info')}`)}
          ${renderLogisticsTableCard('Артикулы в риске по оборачиваемости', 'Фильтр по платформе, кластеру и складу сразу сужает short-list для пополнения.', model.riskRows, 'risk', ['Площадка', 'Точка', 'Артикул', 'Название', 'Owner', 'Ср./день', 'Остаток', 'В пути', 'Покрытие', 'Need'], model.target, `${badge(`${fmt.int(model.riskRows.length)} строк`, model.riskRows.length ? 'warn' : 'ok')}${badge(`цель ${model.target} дн.`, 'info')}`, 'Показываем только строки, где уже есть дефицит к цели или покрытие меньше выбранного горизонта.')}
        </div>
      </section>
    `;
  }

  function bindLogisticsControls(root) {
    const rerender = () => {
      if (typeof renderOrderCalculator === 'function') renderOrderCalculator();
      else if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
    };

    root.querySelectorAll('[data-hotfix-target]').forEach((button) => {
      button.addEventListener('click', () => {
        ensureImperialState().targetDays = Number(button.dataset.hotfixTarget) || 14;
        rerender();
      });
    });

    root.querySelectorAll('[data-hotfix-risk-platform]').forEach((button) => {
      button.addEventListener('click', () => {
        ensureImperialState().riskPlatform = button.dataset.hotfixRiskPlatform || 'all';
        rerender();
      });
    });

    const clusterSelect = root.querySelector('#hotfixImperialClusterFilter');
    if (clusterSelect) {
      clusterSelect.addEventListener('change', () => {
        ensureImperialState().clusterFilter = clusterSelect.value || 'all';
        rerender();
      });
    }

    const warehouseSelect = root.querySelector('#hotfixImperialWarehouseFilter');
    if (warehouseSelect) {
      warehouseSelect.addEventListener('change', () => {
        ensureImperialState().warehouseFilter = warehouseSelect.value || 'all';
        rerender();
      });
    }

    root.querySelector('[data-hotfix-reset-filters]')?.addEventListener('click', () => {
      const imperialState = ensureImperialState();
      imperialState.clusterFilter = 'all';
      imperialState.warehouseFilter = 'all';
      imperialState.riskPlatform = 'all';
      rerender();
    });
  }

  function installLogisticsEnhancer() {
    if (window.__ALTEA_ORDER_PROCUREMENT_ENABLED__) return;
    if (typeof renderOrderCalculator !== 'function') return;
    const original = renderOrderCalculator;
    renderOrderCalculator = function patchedRenderOrderCalculator() {
      original.apply(this, arguments);
      injectHotfixStyles();
      const root = document.getElementById('view-order');
      if (!root || !state.logistics) return;
      const section = root.querySelector('section.imperial-section');
      if (!section) return;
      section.outerHTML = renderImperialLogisticsSection();
      const refreshedRoot = document.getElementById('view-order');
      bindLogisticsControls(refreshedRoot);
      const manualTitle = refreshedRoot.querySelector('.order-layout .card h3');
      if (manualTitle) manualTitle.textContent = 'Ручной калькулятор SKU';
    };
  }

  function scheduleExtraRerenders() {
    if (window.__ALTEA_OPTIMIZED_RENDER__) return;
    const refresh = () => {
      try {
        if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
        if (state.activeSku && typeof renderSkuModal === 'function') renderSkuModal(state.activeSku);
      } catch (error) {
        console.error('[portal-hotfix] rerender', error);
      }
    };
    window.setTimeout(refresh, 2000);
    window.setTimeout(refresh, 6000);
  }

  async function recoverPortal(force = false) {
    if (!ensureBoot()) return;
    ensureImperialState();
    if (typeof loadJson === 'function') loadJson = safeLoadJson;
    if (state.boot.dataReady) return;
    if (!force && window.__ALTEA_PRIMARY_INIT_PENDING__) return;

    if (typeof attachGlobalListeners === 'function') attachGlobalListeners();

    const local = typeof loadLocalStorage === 'function' ? loadLocalStorage() : clone(FALLBACKS.seed);
    const [dashboard, skus, launches, meetings, documents, repricer, seed] = await Promise.all([
      loadJsonOrFallback('data/dashboard.json', FALLBACKS.dashboard, 'Дашборд'),
      loadJsonOrFallback('data/skus.json', FALLBACKS.skus, 'SKU'),
      loadJsonOrFallback('data/launches.json', FALLBACKS.launches, 'Продукт / Ксения'),
      loadJsonOrFallback('data/meetings.json', FALLBACKS.meetings, 'Ритм работы'),
      loadJsonOrFallback('data/documents.json', FALLBACKS.documents, 'Документы'),
      loadJsonOrFallback('data/repricer.json', FALLBACKS.repricer, 'Репрайсер'),
      loadJsonOrFallback('data/seed_comments.json', FALLBACKS.seed, 'Seed comments')
    ]);

    state.dashboard = dashboard || clone(FALLBACKS.dashboard);
    state.skus = Array.isArray(skus) ? skus : [];
    state.launches = Array.isArray(launches) ? launches : [];
    state.meetings = Array.isArray(meetings) ? meetings : [];
    state.documents = documents || clone(FALLBACKS.documents);

    const repricerState = repricer || clone(FALLBACKS.repricer);
    if (Array.isArray(repricerState.items) && !Array.isArray(repricerState.rows)) repricerState.rows = repricerState.items;
    if (Array.isArray(repricerState.rows) && !Array.isArray(repricerState.items)) repricerState.items = repricerState.rows;
    state.repricer = repricerState;

    state.storage = {
      comments: Array.isArray(local.comments) ? local.comments : [],
      tasks: Array.isArray(local.tasks) ? local.tasks : [],
      decisions: Array.isArray(local.decisions) ? local.decisions : [],
      ownerOverrides: Array.isArray(local.ownerOverrides) ? local.ownerOverrides : []
    };

    if (state.orderCalc) {
      if (!state.orderCalc.articleKey) state.orderCalc.articleKey = state.skus[0]?.articleKey || '';
      if (!state.orderCalc.daysToNextReceipt) {
        const leadTime = toNumber(state.skus[0]?.leadTimeDays);
        state.orderCalc.daysToNextReceipt = String(Math.round(leadTime || 30));
      }
    }

    if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
    if (typeof mergeSeedStorage === 'function') mergeSeedStorage(seed || {});

    state.boot.dataReady = true;
    normalizeTeamBadge();

    if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
    if (typeof setView === 'function') setView(state.activeView || 'dashboard');

    if (state.boot.dataWarnings.length) {
      if (typeof setAppError === 'function') {
        setAppError(`Часть данных загружена с исправлениями: ${state.boot.dataWarnings[0]}`);
      }
    } else if (typeof setAppError === 'function') {
      setAppError('');
    }
  }

  function scheduleRecoveryFallback() {
    const attemptRecovery = () => {
      recoverPortal(true).catch((error) => {
        console.error('[portal-hotfix]', error);
        if (typeof setAppError === 'function') {
          setAppError(`Hotfix не смог восстановить портал: ${error.message || 'неизвестная ошибка'}`);
        }
      });
    };

    [3200, 9000].forEach((delay) => {
      window.setTimeout(() => {
        if (state.boot?.dataReady) return;
        attemptRecovery();
      }, delay);
    });
  }

  patchListeners();
  patchSupabaseTimeouts();
  normalizeTeamBadge();
  scheduleTeamBadgeHealing();
  installControlComposer();
  installDashboardEnhancer();
  installLogisticsEnhancer();
  scheduleExtraRerenders();
  scheduleRecoveryFallback();
  return;
  recoverPortal().catch((error) => {
    console.error('[portal-hotfix]', error);
    if (typeof setAppError === 'function') {
      setAppError(`Hotfix не смог восстановить портал: ${error.message || 'неизвестная ошибка'}`);
    }
  });
})();
