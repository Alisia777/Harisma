(function () {
  if (window.__ALTEA_PORTAL_HOTFIX_20260417B__) return;
  window.__ALTEA_PORTAL_HOTFIX_20260417B__ = true;

  const DATA_VERSION = '20260417b';
  const FALLBACKS = {
    dashboard: { cards: [], generatedAt: '' },
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

  function clone(value) {
    if (value === null || value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function addWarning(message) {
    if (!ensureBoot() || !message) return;
    if (!state.boot.dataWarnings.includes(message)) state.boot.dataWarnings.push(message);
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
    state.team.note = note || 'Ошибка Supabase — работаем локально';
    if (typeof updateSyncBadge === 'function') updateSyncBadge();
  }

  function patchSupabaseTimeouts() {
    if (typeof queryRemote === 'function') {
      const originalQueryRemote = queryRemote;
      queryRemote = async function patchedQueryRemote(table) {
        return withTimeout(originalQueryRemote.call(this, table), 8000, `Запрос ${table}`);
      };
    }

    if (typeof upsertRemote === 'function') {
      const originalUpsertRemote = upsertRemote;
      upsertRemote = async function patchedUpsertRemote(table, rows, onConflict) {
        return withTimeout(originalUpsertRemote.call(this, table, rows, onConflict), 8000, `Синхронизация ${table}`);
      };
    }

    if (typeof pullRemoteState === 'function') {
      const originalPullRemoteState = pullRemoteState;
      pullRemoteState = async function patchedPullRemoteState(rerender) {
        try {
          return await withTimeout(originalPullRemoteState.call(this, rerender), 12000, 'Загрузка из Supabase');
        } catch (error) {
          console.error(error);
          setTeamError(error.message || 'Не удалось загрузить данные', 'Ошибка загрузки из Supabase');
          return null;
        }
      };
    }

    if (typeof pushStateToRemote === 'function') {
      const originalPushStateToRemote = pushStateToRemote;
      pushStateToRemote = async function patchedPushStateToRemote() {
        try {
          return await withTimeout(originalPushStateToRemote.call(this), 12000, 'Выгрузка в Supabase');
        } catch (error) {
          console.error(error);
          setTeamError(error.message || 'Не удалось отправить данные', 'Ошибка выгрузки в Supabase');
          return null;
        }
      };
    }

    window.setTimeout(() => {
      if (typeof state !== 'object' || !state?.team) return;
      if (!state.team.ready && state.team.mode === 'pending') {
        setTeamError('Supabase превысил 10 сек.', 'Ошибка Supabase — работаем локально');
      }
    }, 10000);
  }

  function buildTaskComposerHtml() {
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
          <input name="owner" list="ownerOptionsList" placeholder="Owner / кто делает">
          <input name="due" type="date" value="${typeof plusDays === 'function' ? plusDays(3) : ''}">
          <input name="nextAction" placeholder="Следующее действие / комментарий">
          <button class="btn" type="submit">Создать задачу</button>
        </form>
        <div class="muted small" style="margin-top:8px">Если введённый артикул совпадает с SKU в портале, задача сразу привяжется к карточке.</div>
      </div>
    `;
  }

  function installControlComposer() {
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
          platform: 'all',
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

  function scheduleExtraRerenders() {
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

  async function recoverPortal() {
    if (!ensureBoot()) return;
    if (typeof loadJson === 'function') loadJson = safeLoadJson;
    if (state.boot.dataReady) return;

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
        const leadTime = typeof numberOrZero === 'function'
          ? numberOrZero(state.skus[0]?.leadTimeDays)
          : Number(state.skus[0]?.leadTimeDays || 0);
        state.orderCalc.daysToNextReceipt = String(Math.round(leadTime || 30));
      }
    }

    if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
    if (typeof mergeSeedStorage === 'function') mergeSeedStorage(seed || {});

    state.boot.dataReady = true;

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

  patchListeners();
  patchSupabaseTimeouts();
  installControlComposer();
  scheduleExtraRerenders();
  recoverPortal().catch((error) => {
    console.error('[portal-hotfix]', error);
    if (typeof setAppError === 'function') {
      setAppError(`Hotfix не смог восстановить портал: ${error.message || 'неизвестная ошибка'}`);
    }
  });
})();
