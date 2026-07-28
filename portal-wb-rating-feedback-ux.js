(function () {
  if (window.__ALTEA_WB_RATING_FEEDBACK_UX__) return;
  window.__ALTEA_WB_RATING_FEEDBACK_UX__ = true;

  const ROOT_ID = 'view-wb-rating';
  const STYLE_ID = 'altea-wb-rating-feedback-ux-style';
  const DENSITY_KEY = 'altea:wb-rating:density';
  const WORKFLOW_TYPE = 'rating_workflow';
  const WORKFLOW_MARKER = '[[rating-workflow:v1]]';
  const STATUS_LABELS = {
    new: 'Новый',
    progress: 'В работе',
    waiting: 'Ждём ответ',
    done: 'Готово'
  };
  const ENTRY_LABELS = {
    feedback: 'Отзыв по артикулу',
    comment: 'Комментарий для команды'
  };
  const WORKFLOW_FILTER_LABELS = {
    all: 'Все статусы',
    mine: 'Мои карточки',
    overdue: 'Просрочено',
    none: 'Без статуса',
    new: 'Новый',
    progress: 'В работе',
    waiting: 'Ждём ответ',
    done: 'Готово'
  };
  let workflowFilter = 'all';
  let enhanceScheduled = false;
  let dataSyncSequence = 0;
  let dataSyncRuntime = {
    busy: false,
    attempt: 0,
    maxAttempts: 45,
    tone: 'info',
    message: ''
  };

  function storageGet(key, fallback = '') {
    try {
      return window.localStorage.getItem(key) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // The interface remains usable when storage is unavailable.
    }
  }

  function appState() {
    return window.__alteaAppState || (typeof state !== 'undefined' ? state : {});
  }

  function appConfig() {
    if (typeof window.currentConfig === 'function') {
      try {
        return window.currentConfig() || window.APP_CONFIG || {};
      } catch (error) {
        return window.APP_CONFIG || {};
      }
    }
    return window.APP_CONFIG || {};
  }

  function wbFeedbackSyncEndpoint() {
    const cfg = appConfig();
    return String(
      cfg.wbFeedbackSyncEndpoint
      || (cfg.supabase?.url ? `${String(cfg.supabase.url).replace(/\/+$/, '')}/functions/v1/wb-feedback-sync` : '')
    ).trim();
  }

  function wbFeedbackSyncAuthToken() {
    const cfg = appConfig();
    const token = appState()?.team?.accessToken
      || window.alteaPortalAuthGate?.getSession?.()?.access_token
      || window.__ALTEA_AUTH_SESSION__?.access_token
      || '';
    if (!token || token === cfg.supabase?.anonKey) return '';
    return token;
  }

  function feedbackSnapshotStatus() {
    const payload = appState()?.wbFeedbacks || {};
    const generatedAt = String(payload.generatedAt || '');
    const stamp = Date.parse(generatedAt);
    const ageMs = Number.isFinite(stamp) ? Math.max(0, Date.now() - stamp) : null;
    return {
      payload,
      generatedAt,
      stamp: Number.isFinite(stamp) ? stamp : 0,
      ageMs,
      stale: ageMs === null || ageMs > 90 * 60 * 1000
    };
  }

  function formatSyncDate(value) {
    const stamp = Date.parse(value || '');
    if (!Number.isFinite(stamp)) return 'ещё не было';
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(stamp));
  }

  function formatAge(ageMs) {
    if (!Number.isFinite(ageMs)) return 'возраст неизвестен';
    const minutes = Math.max(0, Math.round(ageMs / 60000));
    if (minutes < 2) return 'только что';
    if (minutes < 60) return `${minutes} мин назад`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours < 24) return `${hours} ч${rest ? ` ${rest} мин` : ''} назад`;
    return `${Math.floor(hours / 24)} дн назад`;
  }

  function setDataSyncRuntime(next = {}) {
    dataSyncRuntime = { ...dataSyncRuntime, ...next };
    updateRatingDataSyncUi(document.getElementById(ROOT_ID));
    try {
      window.dispatchEvent(new CustomEvent('altea:wb-feedback-sync-state', {
        detail: { ...dataSyncRuntime }
      }));
    } catch (error) {
      // The status still remains visible when CustomEvent is unavailable.
    }
  }

  window.alteaWbFeedbackSyncState = function alteaWbFeedbackSyncState() {
    return { ...dataSyncRuntime };
  };

  function updateRatingDataSyncUi(root) {
    if (!root) return;
    const status = feedbackSnapshotStatus();
    const endpoint = wbFeedbackSyncEndpoint();
    root.dataset.ratingDataStale = status.stale ? '1' : '0';
    const button = root.querySelector('[data-rating-data-refresh]');
    if (button) {
      button.disabled = dataSyncRuntime.busy || !endpoint;
      button.setAttribute('aria-busy', dataSyncRuntime.busy ? 'true' : 'false');
      button.textContent = dataSyncRuntime.busy
        ? (dataSyncRuntime.attempt > 0
          ? `Обновляем · ${dataSyncRuntime.attempt}/${dataSyncRuntime.maxAttempts}`
          : 'Обновляем · запуск')
        : 'Обновить отзывы и вопросы';
    }
    const meta = root.querySelector('[data-rating-data-freshness]');
    if (meta) {
      const windowTo = status.payload?.window?.to ? ` · данные по ${status.payload.window.to}` : '';
      meta.textContent = `Последнее обновление: ${formatSyncDate(status.generatedAt)} · ${formatAge(status.ageMs)}${windowTo}`;
      meta.dataset.tone = status.stale ? 'warn' : 'ok';
    }
    const message = root.querySelector('[data-rating-data-refresh-status]');
    if (message) {
      message.textContent = dataSyncRuntime.message || (
        endpoint
          ? 'Автоматически каждые 30 минут. После ручного запуска портал сам подхватит новый снимок.'
          : 'Защищённый endpoint обновления ещё не настроен.'
      );
      message.dataset.tone = dataSyncRuntime.message ? dataSyncRuntime.tone : (endpoint ? 'info' : 'danger');
    }
  }

  function renderFeedbackViewAfterSync() {
    if (typeof window.renderWbCardRating === 'function') {
      window.renderWbCardRating(ROOT_ID);
    } else if (typeof window.rerenderCurrentView === 'function') {
      window.rerenderCurrentView();
    }
    window.requestAnimationFrame(() => scheduleEnhance());
  }

  function pollWbFeedbackSnapshot(baselineStamp, attempt = 0) {
    const testDelay = Number(window.__ALTEA_WB_FEEDBACK_SYNC_TEST_POLL_MS__);
    const delay = Number.isFinite(testDelay) && testDelay >= 0
      ? testDelay
      : (attempt === 0 ? 4000 : 8000);
    window.setTimeout(async () => {
      try {
        if (typeof window.__alteaRefreshSnapshotBackedState === 'function') {
          await window.__alteaRefreshSnapshotBackedState({
            view: 'wb-rating',
            keys: ['wb_feedbacks_summary'],
            rerender: false
          });
        }
        const nextStatus = feedbackSnapshotStatus();
        if (nextStatus.stamp > baselineStamp) {
          setDataSyncRuntime({
            busy: false,
            attempt: attempt + 1,
            tone: 'ok',
            message: 'Готово: свежие отзывы, вопросы и рейтинг WB загружены. Хвосты пересверены с текущими счётчиками кабинета.'
          });
          renderFeedbackViewAfterSync();
          return;
        }
        if (attempt + 1 < dataSyncRuntime.maxAttempts) {
          setDataSyncRuntime({
            busy: true,
            attempt: attempt + 1,
            tone: 'info',
            message: `WB собирает отзывы и вопросы; портал ждёт новый снимок · проверка ${attempt + 1}/${dataSyncRuntime.maxAttempts}.`
          });
          pollWbFeedbackSnapshot(baselineStamp, attempt + 1);
          return;
        }
        setDataSyncRuntime({
          busy: false,
          attempt: dataSyncRuntime.maxAttempts,
          tone: 'warn',
          message: 'Запуск принят, но снимок ещё не опубликован. Повторите обновление через несколько минут.'
        });
      } catch (error) {
        if (attempt + 1 < dataSyncRuntime.maxAttempts) {
          setDataSyncRuntime({
            busy: true,
            attempt: attempt + 1,
            tone: 'warn',
            message: `Снимок пока недоступен; повторяю проверку ${attempt + 1}/${dataSyncRuntime.maxAttempts}.`
          });
          pollWbFeedbackSnapshot(baselineStamp, attempt + 1);
          return;
        }
        setDataSyncRuntime({
          busy: false,
          attempt: dataSyncRuntime.maxAttempts,
          tone: 'danger',
          message: 'Не удалось прочитать результат синхронизации. Обновите страницу и повторите.'
        });
      }
    }, delay);
  }

  async function requestWbFeedbackSync(button) {
    if (!button || dataSyncRuntime.busy || button.dataset.ratingDataRefreshBusy === '1') return;
    const endpoint = wbFeedbackSyncEndpoint();
    const token = wbFeedbackSyncAuthToken();
    if (!endpoint) {
      setDataSyncRuntime({ tone: 'danger', message: 'Не настроен защищённый endpoint обновления.' });
      return;
    }
    if (!token) {
      setDataSyncRuntime({ tone: 'danger', message: 'Нужно войти в портал под рабочей учётной записью.' });
      return;
    }
    const cfg = appConfig();
    const baselineStamp = feedbackSnapshotStatus().stamp;
    const actionToken = String(++dataSyncSequence);
    button.dataset.ratingDataRefreshBusy = '1';
    button.dataset.ratingDataRefreshAction = actionToken;
    setDataSyncRuntime({
      busy: true,
      attempt: 0,
      maxAttempts: 45,
      tone: 'info',
      message: 'Отправляю защищённый запрос на обновление WB…'
    });
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: cfg.supabase?.anonKey || '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          source: 'portal-wb-rating',
          requestedAt: new Date().toISOString()
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        const detail = response.status === 404
          ? 'Серверная функция обновления ещё не опубликована (HTTP 404).'
          : (payload?.detail || payload?.error || `HTTP ${response.status}`);
        throw new Error(detail);
      }
      setDataSyncRuntime({
        busy: true,
        attempt: 0,
        tone: 'ok',
        message: 'Запуск принят. Собираю отзывы, вопросы и рейтинг продавца WB; экран обновится автоматически.'
      });
      pollWbFeedbackSnapshot(baselineStamp);
    } catch (error) {
      setDataSyncRuntime({
        busy: false,
        attempt: 0,
        tone: 'danger',
        message: `Не удалось запустить обновление: ${error?.message || error}`
      });
    } finally {
      delete button.dataset.ratingDataRefreshBusy;
      delete button.dataset.ratingDataRefreshAction;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function normalizeKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\p{L}\p{N}_-]+/gu, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function currentDensity() {
    return storageGet(DENSITY_KEY, 'compact') === 'full' ? 'full' : 'compact';
  }

  function encodedMeta(value) {
    return encodeURIComponent(String(value || '').trim());
  }

  function decodedMeta(value) {
    try {
      return decodeURIComponent(String(value || ''));
    } catch (error) {
      return String(value || '');
    }
  }

  function parseWorkflowComment(comment = {}) {
    const text = String(comment.text || '');
    if (comment.type !== WORKFLOW_TYPE && !text.includes(WORKFLOW_MARKER)) return null;
    const platform = text.match(/\[\[platform:([^\]]+)\]\]/i)?.[1] || 'wb';
    const status = text.match(/\[\[status:([^\]]+)\]\]/i)?.[1] || 'new';
    const entryKind = text.match(/\[\[entry:([^\]]+)\]\]/i)?.[1] || 'comment';
    const owner = decodedMeta(text.match(/\[\[owner:([^\]]*)\]\]/i)?.[1] || '');
    const due = text.match(/\[\[due:([^\]]*)\]\]/i)?.[1] || '';
    const body = text
      .replace(WORKFLOW_MARKER, '')
      .replace(/\[\[(platform|status|entry|owner|due):[^\]]*\]\]/gi, '')
      .trim();
    return {
      id: comment.id || '',
      articleKey: String(comment.articleKey || '').trim(),
      platform: platform === 'ozon' ? 'ozon' : 'wb',
      status: STATUS_LABELS[status] ? status : 'new',
      entryKind: ENTRY_LABELS[entryKind] ? entryKind : 'comment',
      owner,
      due,
      text: body,
      author: String(comment.author || 'Команда').trim() || 'Команда',
      team: String(comment.team || 'Команда').trim() || 'Команда',
      createdAt: comment.createdAt || ''
    };
  }

  function workflowEntries(platform, articleKey) {
    const platformKey = platform === 'ozon' ? 'ozon' : 'wb';
    const articleNeedle = normalizeKey(articleKey);
    const comments = Array.isArray(appState()?.storage?.comments) ? appState().storage.comments : [];
    return comments
      .map(parseWorkflowComment)
      .filter((entry) => entry
        && entry.platform === platformKey
        && normalizeKey(entry.articleKey) === articleNeedle)
      .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0));
  }

  function latestWorkflow(platform, articleKey) {
    return workflowEntries(platform, articleKey)[0] || null;
  }

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function workflowIsOverdue(entry) {
    return Boolean(entry?.due && entry.due < localDateKey() && entry.status !== 'done');
  }

  function workflowIsMine(entry) {
    if (!entry) return false;
    const member = normalizeKey(currentMemberName());
    if (!member) return false;
    return entry.owner
      ? normalizeKey(entry.owner) === member
      : normalizeKey(entry.author) === member;
  }

  function workflowCatalog(platform = 'wb') {
    const platformKey = platform === 'ozon' ? 'ozon' : 'wb';
    const comments = Array.isArray(appState()?.storage?.comments) ? appState().storage.comments : [];
    const catalog = new Map();
    comments
      .map(parseWorkflowComment)
      .filter((entry) => entry?.platform === platformKey && entry.articleKey)
      .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0))
      .forEach((entry) => {
        const key = normalizeKey(entry.articleKey);
        if (key && !catalog.has(key)) catalog.set(key, entry);
      });
    return [...catalog.values()];
  }

  function workflowSearchText(articleKey, platform = 'wb') {
    return workflowEntries(platform, articleKey)
      .map((entry) => [
        entry.text,
        entry.author,
        entry.team,
        entry.owner,
        entry.due,
        ENTRY_LABELS[entry.entryKind],
        STATUS_LABELS[entry.status]
      ].filter(Boolean).join(' '))
      .join(' ');
  }

  function workflowMatches(articleKey, platform = 'wb') {
    if (workflowFilter === 'all') return true;
    const latest = latestWorkflow(platform, articleKey);
    if (workflowFilter === 'mine') return workflowIsMine(latest);
    if (workflowFilter === 'overdue') return workflowIsOverdue(latest);
    return workflowFilter === (latest?.status || 'none');
  }

  function workflowPayload({ platform, status, entryKind, owner, due, text }) {
    return [
      WORKFLOW_MARKER,
      `[[platform:${platform === 'ozon' ? 'ozon' : 'wb'}]]`,
      `[[status:${STATUS_LABELS[status] ? status : 'new'}]]`,
      `[[entry:${ENTRY_LABELS[entryKind] ? entryKind : 'comment'}]]`,
      `[[owner:${encodedMeta(owner)}]]`,
      `[[due:${String(due || '').trim()}]]`,
      String(text || '').trim()
    ].join('');
  }

  function currentMemberName() {
    const st = appState();
    const sessionUser = window.__ALTEA_AUTH_SESSION__?.user || window.alteaPortalAuthGate?.getSession?.()?.user || {};
    return String(
      st?.team?.member?.name
      || sessionUser?.user_metadata?.full_name
      || sessionUser?.user_metadata?.name
      || sessionUser?.email
      || 'Сотрудник'
    ).trim() || 'Сотрудник';
  }

  function currentTeamLabel() {
    if (typeof window.teamMemberLabel === 'function') {
      try {
        return window.teamMemberLabel();
      } catch (error) {
        // Fall back to the role below.
      }
    }
    return String(appState()?.team?.member?.role || 'Команда').trim() || 'Команда';
  }

  function remoteWorkflowAvailable() {
    if (typeof window.hasRemoteStore === 'function') {
      try {
        return Boolean(window.hasRemoteStore());
      } catch (error) {
        return false;
      }
    }
    return appState()?.team?.mode === 'ready';
  }

  window.__alteaRatingWorkflowSearchText = workflowSearchText;
  window.__alteaRatingWorkflowMatches = workflowMatches;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} .rating-feedback-toolbar {
        display:flex;
        align-items:stretch;
        justify-content:space-between;
        flex-direction:column;
        gap:12px;
        margin:0 0 14px;
        padding:10px 12px;
        border:1px solid rgba(216,176,102,.22);
        border-radius:10px;
        background:
          radial-gradient(circle at 12% 0%,rgba(216,176,102,.14),transparent 38%),
          linear-gradient(135deg,rgba(216,176,102,.08),rgba(255,255,255,.02));
        box-shadow:0 18px 55px rgba(0,0,0,.16);
      }
      #${ROOT_ID} .rating-feedback-toolbar__main,
      #${ROOT_ID} .rating-density-switch,
      #${ROOT_ID} .rating-row-actions {
        display:flex;
        align-items:center;
        gap:7px;
        flex-wrap:wrap;
      }
      #${ROOT_ID} .rating-data-refresh {
        display:grid;
        grid-template-columns:auto minmax(240px,1fr);
        align-items:center;
        gap:6px 10px;
        width:100%;
        padding:10px;
        border:1px solid rgba(216,176,102,.22);
        border-radius:9px;
        background:rgba(5,4,7,.28);
      }
      #${ROOT_ID} .rating-data-refresh button {
        grid-row:1 / span 2;
        min-height:42px;
        border:1px solid rgba(216,176,102,.62);
        border-radius:8px;
        background:linear-gradient(135deg,rgba(216,176,102,.26),rgba(216,176,102,.10));
        color:#fff0c8;
        padding:9px 14px;
        font:inherit;
        font-size:12px;
        font-weight:900;
        cursor:pointer;
      }
      #${ROOT_ID} .rating-data-refresh button:hover:not(:disabled) {
        border-color:#f3d590;
        transform:translateY(-1px);
      }
      #${ROOT_ID} .rating-data-refresh button:disabled { opacity:.55; cursor:wait; }
      #${ROOT_ID} .rating-data-refresh__meta,
      #${ROOT_ID} .rating-data-refresh__status {
        min-width:0;
        font-size:11px;
        line-height:1.35;
      }
      #${ROOT_ID} .rating-data-refresh__meta { color:#d8c9ae; font-weight:800; }
      #${ROOT_ID} .rating-data-refresh__status { color:var(--muted); }
      #${ROOT_ID} .rating-data-refresh__meta[data-tone="warn"],
      #${ROOT_ID} .rating-data-refresh__status[data-tone="warn"] { color:#f1c978; }
      #${ROOT_ID} .rating-data-refresh__meta[data-tone="ok"],
      #${ROOT_ID} .rating-data-refresh__status[data-tone="ok"] { color:#9cdeb9; }
      #${ROOT_ID} .rating-data-refresh__status[data-tone="danger"] { color:#ff9c9c; }
      #${ROOT_ID}[data-rating-data-stale="1"] .rating-smart-board {
        border-color:rgba(241,201,120,.48);
      }
      #${ROOT_ID} .rating-work-table {
        max-width:100%;
        max-height:min(68vh,720px);
        overflow:auto;
        overscroll-behavior:contain;
        scrollbar-gutter:stable both-edges;
        scrollbar-width:auto;
        touch-action:pan-x pan-y;
        -webkit-overflow-scrolling:touch;
      }
      #${ROOT_ID} .rating-work-table::-webkit-scrollbar { width:13px; height:13px; }
      #${ROOT_ID} .rating-work-table::-webkit-scrollbar-thumb {
        border:3px solid transparent;
        border-radius:999px;
        background:rgba(216,176,102,.48);
        background-clip:padding-box;
      }
      #${ROOT_ID} .rating-work-table::-webkit-scrollbar-track { background:rgba(255,255,255,.035); }
      #${ROOT_ID} .rating-action-guide {
        display:flex;
        align-items:center;
        gap:6px;
        padding:8px 10px;
        border:1px solid rgba(97,201,155,.18);
        border-radius:8px;
        background:rgba(97,201,155,.06);
        color:var(--muted);
        font-size:11px;
        line-height:1.4;
      }
      #${ROOT_ID} .rating-action-guide strong { color:#c8f4df; }
      #${ROOT_ID} .rating-smart-board {
        position:relative;
        display:grid;
        grid-template-columns:minmax(260px,1.15fr) minmax(480px,1.85fr);
        gap:18px;
        margin:0 0 16px;
        padding:18px;
        overflow:hidden;
        border:1px solid rgba(216,176,102,.26);
        border-radius:16px;
        background:
          radial-gradient(circle at 88% -20%,rgba(216,176,102,.21),transparent 42%),
          linear-gradient(145deg,rgba(27,20,26,.98),rgba(13,10,14,.98));
        box-shadow:0 22px 70px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.04);
      }
      #${ROOT_ID} .rating-smart-board::before {
        content:"";
        position:absolute;
        inset:0 auto 0 0;
        width:3px;
        background:linear-gradient(180deg,#f6d596,#9f7438);
      }
      #${ROOT_ID} .rating-smart-board__copy {
        position:relative;
        z-index:1;
        display:flex;
        flex-direction:column;
        justify-content:center;
        min-width:0;
      }
      #${ROOT_ID} .rating-smart-board__eyebrow {
        color:#d8b66f;
        font-size:10px;
        font-weight:900;
        letter-spacing:.16em;
        text-transform:uppercase;
      }
      #${ROOT_ID} .rating-smart-board h3 {
        margin:6px 0 7px;
        color:#fff7e6;
        font-family:Georgia,"Times New Roman",serif;
        font-size:clamp(20px,2vw,28px);
        font-weight:600;
        line-height:1.08;
      }
      #${ROOT_ID} .rating-smart-board__summary {
        max-width:560px;
        margin:0;
        color:var(--muted);
        font-size:12px;
        line-height:1.5;
      }
      #${ROOT_ID} .rating-smart-board__summary strong { color:#fff1ca; }
      #${ROOT_ID} .rating-smart-kpis {
        position:relative;
        z-index:1;
        display:grid;
        grid-template-columns:repeat(5,minmax(0,1fr));
        gap:8px;
      }
      #${ROOT_ID} .rating-smart-kpi {
        display:flex;
        min-width:0;
        flex-direction:column;
        justify-content:space-between;
        gap:8px;
        min-height:88px;
        padding:11px;
        border:1px solid rgba(255,255,255,.08);
        border-radius:11px;
        background:linear-gradient(160deg,rgba(255,255,255,.052),rgba(255,255,255,.018));
        color:inherit;
        text-align:left;
        cursor:pointer;
        transition:transform .16s ease,border-color .16s ease,background .16s ease;
      }
      #${ROOT_ID} .rating-smart-kpi:hover,
      #${ROOT_ID} .rating-smart-kpi.is-active {
        transform:translateY(-2px);
        border-color:rgba(216,176,102,.52);
        background:linear-gradient(160deg,rgba(216,176,102,.15),rgba(255,255,255,.025));
      }
      #${ROOT_ID} .rating-smart-kpi[data-tone="danger"] { border-color:rgba(242,125,125,.2); }
      #${ROOT_ID} .rating-smart-kpi[data-tone="danger"] .rating-smart-kpi__value { color:#ffd0d0; }
      #${ROOT_ID} .rating-smart-kpi[data-tone="gold"] .rating-smart-kpi__value { color:#ffe1a1; }
      #${ROOT_ID} .rating-smart-kpi__label {
        overflow:hidden;
        color:var(--muted);
        font-size:10px;
        font-weight:800;
        line-height:1.25;
        text-overflow:ellipsis;
      }
      #${ROOT_ID} .rating-smart-kpi__value {
        color:#fff7e6;
        font-size:24px;
        font-weight:800;
        line-height:1;
      }
      #${ROOT_ID} .rating-smart-kpi__hint {
        color:rgba(255,255,255,.42);
        font-size:9px;
      }
      #${ROOT_ID} .rating-api-truth {
        color:var(--muted);
        font-size:12px;
        line-height:1.35;
      }
      #${ROOT_ID} .rating-api-truth strong { color:#f8dfa8; }
      #${ROOT_ID} .rating-team-sync {
        display:inline-flex;
        align-items:center;
        gap:6px;
        color:#c8f4df;
        font-size:11px;
        font-weight:800;
      }
      #${ROOT_ID} .rating-team-sync::before {
        content:"";
        width:7px;
        height:7px;
        border-radius:999px;
        background:#61c99b;
      }
      #${ROOT_ID} .rating-team-sync.is-local { color:#f8dfa8; }
      #${ROOT_ID} .rating-team-sync.is-local::before { background:#d7a64c; }
      #${ROOT_ID} .rating-density-switch button,
      #${ROOT_ID} .rating-copy-button,
      #${ROOT_ID} .rating-note-button {
        border:1px solid rgba(255,255,255,.12);
        border-radius:999px;
        background:rgba(255,255,255,.04);
        color:var(--text);
        padding:7px 10px;
        font:inherit;
        font-size:11px;
        font-weight:800;
        line-height:1;
        cursor:pointer;
        white-space:nowrap;
      }
      #${ROOT_ID} .rating-density-switch button.active,
      #${ROOT_ID} .rating-copy-button:hover,
      #${ROOT_ID} .rating-note-button:hover {
        border-color:rgba(216,176,102,.68);
        background:rgba(216,176,102,.16);
        color:#ffe6ae;
      }
      #${ROOT_ID} .rating-copy-button.is-copied {
        border-color:rgba(97,201,155,.52);
        background:rgba(97,201,155,.14);
        color:#c8f4df;
      }
      #${ROOT_ID} .rating-row-actions { margin-top:7px; }
      #${ROOT_ID} .rating-work-table table.rating-has-comment-column {
        min-width:2340px;
      }
      #${ROOT_ID} .rating-team-comment-head,
      #${ROOT_ID} .rating-team-comment-cell {
        width:280px;
        min-width:280px;
        max-width:280px;
      }
      #${ROOT_ID} .rating-team-comment-head span,
      #${ROOT_ID} .rating-team-comment-head small {
        display:block;
      }
      #${ROOT_ID} .rating-team-comment-head small {
        margin-top:3px;
        color:#9cdeb9;
        font-size:9px;
        font-weight:800;
        letter-spacing:0;
        text-transform:none;
      }
      #${ROOT_ID} .rating-team-comment-box {
        display:grid;
        gap:7px;
        min-height:74px;
        padding:9px;
        border:1px solid rgba(216,176,102,.18);
        border-radius:9px;
        background:rgba(216,176,102,.055);
      }
      #${ROOT_ID} .rating-team-comment-box[data-has-comment="1"] {
        border-color:rgba(97,201,155,.28);
        background:rgba(97,201,155,.06);
      }
      #${ROOT_ID} .rating-team-comment-box .rating-note-button {
        width:100%;
        min-height:34px;
        border-radius:8px;
        border-color:rgba(216,176,102,.58);
        background:linear-gradient(135deg,rgba(216,176,102,.24),rgba(216,176,102,.1));
        color:#fff0c8;
        white-space:normal;
      }
      #${ROOT_ID} .rating-team-comment-box[data-has-comment="0"] .rating-note-button::before {
        content:"+ ";
      }
      #${ROOT_ID} .rating-team-comment-preview {
        display:-webkit-box;
        overflow:hidden;
        color:#efe5d6;
        font-size:11px;
        line-height:1.35;
        -webkit-box-orient:vertical;
        -webkit-line-clamp:2;
      }
      #${ROOT_ID} .rating-team-comment-placeholder {
        color:var(--muted);
        font-size:10px;
        line-height:1.35;
      }
      #${ROOT_ID} .rating-team-comment-meta {
        display:flex;
        align-items:center;
        gap:6px;
        flex-wrap:wrap;
        color:#9cdeb9;
        font-size:9px;
        font-weight:800;
      }
      #${ROOT_ID} .rating-note-button[data-note-status="progress"] {
        border-color:rgba(216,176,102,.48);
        color:#f8dfa8;
      }
      #${ROOT_ID} .rating-note-button[data-note-status="waiting"] {
        border-color:rgba(115,167,255,.48);
        color:#d8e6ff;
      }
      #${ROOT_ID} .rating-note-button[data-note-status="done"] {
        border-color:rgba(97,201,155,.48);
        color:#c8f4df;
      }
      #${ROOT_ID} .rating-workflow-status {
        display:inline-flex;
        align-items:center;
        min-height:23px;
        border:1px solid rgba(255,255,255,.1);
        border-radius:999px;
        padding:0 8px;
        color:var(--muted);
        font-size:10px;
        font-weight:800;
        white-space:nowrap;
      }
      #${ROOT_ID} .rating-workflow-status[data-status="progress"] { color:#f8dfa8; }
      #${ROOT_ID} .rating-workflow-status[data-status="waiting"] { color:#d8e6ff; }
      #${ROOT_ID} .rating-workflow-status[data-status="done"] { color:#c8f4df; }
      #${ROOT_ID} .rating-priority-flag {
        display:inline-flex;
        align-items:center;
        min-height:23px;
        border:1px solid rgba(242,125,125,.24);
        border-radius:999px;
        padding:0 8px;
        background:rgba(242,125,125,.07);
        color:#ffd0d0;
        font-size:10px;
        font-weight:900;
        white-space:nowrap;
      }
      #${ROOT_ID} .rating-work-row[data-rating-smart-priority="overdue"] .article-cell {
        box-shadow:inset 3px 0 #db8a70,8px 0 14px rgba(0,0,0,.14);
      }
      #${ROOT_ID} .rating-work-row[data-rating-smart-priority="critical"] .article-cell {
        box-shadow:inset 3px 0 #d8b066,8px 0 14px rgba(0,0,0,.14);
      }
      #${ROOT_ID} .rating-row-owner {
        display:inline-block;
        max-width:150px;
        overflow:hidden;
        text-overflow:ellipsis;
        color:var(--muted);
        font-size:10px;
        white-space:nowrap;
      }
      #${ROOT_ID} .rating-workflow-filter {
        display:flex;
        align-items:center;
        gap:7px;
      }
      #${ROOT_ID} .rating-workflow-filter > span {
        color:var(--muted);
        font-size:11px;
        font-weight:800;
      }
      #${ROOT_ID} .rating-work-row.is-workflow-filtered { display:none; }
      #${ROOT_ID} .rating-more-row {
        display:flex;
        align-items:center;
        justify-content:center;
        gap:10px;
        padding:12px 16px 14px;
        color:var(--muted);
        font-size:11px;
      }
      #${ROOT_ID} .rating-more-row button {
        border:1px solid rgba(216,176,102,.34);
        border-radius:999px;
        background:rgba(216,176,102,.1);
        color:#ffe6ae;
        padding:8px 12px;
        font:inherit;
        font-weight:800;
        cursor:pointer;
      }
      #${ROOT_ID} .rating-sort-control.rating-ux-collapsed > button { display:none; }
      #${ROOT_ID} .rating-ux-select {
        min-width:150px;
        height:34px;
        border:1px solid rgba(216,176,102,.24);
        border-radius:999px;
        background:#171116;
        color:#fff7e6;
        padding:0 34px 0 11px;
        font:inherit;
        font-size:12px;
        font-weight:800;
        cursor:pointer;
      }
      #${ROOT_ID} .rating-work-table table.rating-ux-wide-table th:nth-child(1),
      #${ROOT_ID} .rating-work-table table.rating-ux-wide-table td:nth-child(1) {
        position:sticky;
        left:0;
        z-index:5;
        background:#120d12;
        box-shadow:8px 0 14px rgba(0,0,0,.14);
      }
      #${ROOT_ID} .rating-work-table table.rating-ux-wide-table th:nth-child(2),
      #${ROOT_ID} .rating-work-table table.rating-ux-wide-table td:nth-child(2) {
        position:sticky;
        left:230px;
        z-index:5;
        background:#120d12;
        box-shadow:8px 0 14px rgba(0,0,0,.1);
      }
      #${ROOT_ID} .rating-work-table table.rating-ux-wide-table thead th:nth-child(1),
      #${ROOT_ID} .rating-work-table table.rating-ux-wide-table thead th:nth-child(2) {
        z-index:8;
        background:#181019;
      }
      #${ROOT_ID}[data-rating-density="compact"] .rating-planfact-board {
        grid-template-columns:repeat(5,minmax(0,1fr));
      }
      #${ROOT_ID}[data-rating-density="compact"][data-rating-platform-current="wb"]
        .rating-planfact-board > [data-rating-platform="ozon"],
      #${ROOT_ID}[data-rating-density="compact"][data-rating-platform-current="ozon"]
        .rating-planfact-board > [data-rating-platform="wb"] {
        display:none;
      }
      #${ROOT_ID}[data-rating-density="compact"] .rating-planfact-card {
        min-height:104px;
        padding:11px;
      }
      #${ROOT_ID}[data-rating-density="compact"] .rating-planfact-card .sku-plan-platform-card__meta,
      #${ROOT_ID}[data-rating-density="compact"] .rating-planfact-card .sku-plan-platform-card__foot {
        display:none;
      }
      #${ROOT_ID}[data-rating-density="compact"] .rating-detail-panel { padding:12px; }
      #${ROOT_ID}[data-rating-density="compact"] .rating-work-table table.rating-ux-wide-table th:nth-child(6),
      #${ROOT_ID}[data-rating-density="compact"] .rating-work-table table.rating-ux-wide-table td:nth-child(6),
      #${ROOT_ID}[data-rating-density="compact"] .rating-work-table table.rating-ux-wide-table th:nth-child(8),
      #${ROOT_ID}[data-rating-density="compact"] .rating-work-table table.rating-ux-wide-table td:nth-child(8),
      #${ROOT_ID}[data-rating-density="compact"] .rating-work-table table.rating-ux-wide-table th:nth-child(9),
      #${ROOT_ID}[data-rating-density="compact"] .rating-work-table table.rating-ux-wide-table td:nth-child(9),
      #${ROOT_ID}[data-rating-density="compact"] .rating-work-table table.rating-ux-wide-table th:nth-child(12),
      #${ROOT_ID}[data-rating-density="compact"] .rating-work-table table.rating-ux-wide-table td:nth-child(12),
      #${ROOT_ID}[data-rating-density="compact"] .rating-work-table table.rating-ux-wide-table th:nth-child(13),
      #${ROOT_ID}[data-rating-density="compact"] .rating-work-table table.rating-ux-wide-table td:nth-child(13),
      #${ROOT_ID}[data-rating-density="compact"] .rating-work-table table.rating-ux-wide-table th:nth-child(15),
      #${ROOT_ID}[data-rating-density="compact"] .rating-work-table table.rating-ux-wide-table td:nth-child(15),
      #${ROOT_ID}[data-rating-density="compact"] .rating-work-table table.rating-ux-wide-table th:nth-child(16),
      #${ROOT_ID}[data-rating-density="compact"] .rating-work-table table.rating-ux-wide-table td:nth-child(16),
      #${ROOT_ID}[data-rating-density="compact"] .rating-work-table table.rating-ux-wide-table th:nth-child(17),
      #${ROOT_ID}[data-rating-density="compact"] .rating-work-table table.rating-ux-wide-table td:nth-child(17) {
        display:none;
      }
      .rating-note-backdrop {
        position:fixed;
        inset:0;
        z-index:12000;
        display:grid;
        place-items:center;
        padding:20px;
        background:rgba(0,0,0,.74);
        backdrop-filter:blur(8px);
      }
      .rating-note-dialog {
        width:min(760px,96vw);
        max-height:min(88vh,860px);
        overflow:auto;
        border:1px solid rgba(216,176,102,.34);
        border-radius:14px;
        background:linear-gradient(145deg,#181319,#0f0c10);
        color:#fff7e6;
        box-shadow:0 28px 90px rgba(0,0,0,.62);
      }
      .rating-note-dialog__head,
      .rating-note-dialog__actions {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        padding:15px 17px;
        border-bottom:1px solid rgba(216,176,102,.16);
      }
      .rating-note-dialog__head h3 { margin:0; font-size:19px; }
      .rating-note-dialog__body { display:grid; gap:12px; padding:17px; }
      .rating-note-dialog label { display:grid; gap:6px; color:var(--muted); font-size:12px; font-weight:800; }
      .rating-note-dialog textarea,
      .rating-note-dialog select,
      .rating-note-dialog input {
        width:100%;
        box-sizing:border-box;
        border:1px solid rgba(255,255,255,.12);
        border-radius:9px;
        background:rgba(255,255,255,.05);
        color:#fff7e6;
        padding:10px 11px;
        font:inherit;
      }
      .rating-note-dialog textarea { min-height:130px; resize:vertical; line-height:1.45; }
      .rating-note-dialog__fields {
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:10px;
      }
      .rating-note-history {
        display:grid;
        gap:8px;
        max-height:260px;
        overflow:auto;
        padding-right:2px;
      }
      .rating-note-history h4 { margin:4px 0 0; font-size:14px; }
      .rating-note-history__item {
        border:1px solid rgba(255,255,255,.09);
        border-radius:9px;
        background:rgba(255,255,255,.025);
        padding:10px 11px;
      }
      .rating-note-history__meta {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        color:var(--muted);
        font-size:10px;
      }
      .rating-note-history__item p { margin:7px 0 0; line-height:1.4; }
      .rating-note-history__item small { display:block; margin-top:6px; color:var(--muted); }
      .rating-note-form-error {
        min-height:18px;
        color:#ffd0d0;
        font-size:12px;
      }
      .rating-note-sync-hint {
        color:var(--muted);
        font-size:11px;
        line-height:1.4;
      }
      .rating-note-dialog__actions {
        justify-content:flex-end;
        border-top:1px solid rgba(216,176,102,.16);
        border-bottom:0;
      }
      .rating-note-dialog__actions button {
        border:1px solid rgba(255,255,255,.14);
        border-radius:999px;
        background:rgba(255,255,255,.05);
        color:#fff7e6;
        padding:9px 13px;
        font:inherit;
        font-weight:800;
        cursor:pointer;
      }
      .rating-note-dialog__actions button[data-rating-note-save] {
        border-color:rgba(216,176,102,.56);
        background:rgba(216,176,102,.16);
        color:#ffe6ae;
      }
      @media (max-width:1200px) {
        #${ROOT_ID} .rating-smart-board { grid-template-columns:1fr; }
        #${ROOT_ID}[data-rating-density="compact"] .rating-planfact-board {
          grid-template-columns:repeat(2,minmax(0,1fr));
        }
      }
      @media (max-width:720px) {
        #${ROOT_ID} .rating-feedback-toolbar { align-items:stretch; flex-direction:column; }
        #${ROOT_ID} .rating-smart-board { padding:15px; }
        #${ROOT_ID} .rating-smart-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); }
        #${ROOT_ID} .rating-data-refresh { grid-template-columns:1fr; }
        #${ROOT_ID} .rating-data-refresh button { grid-row:auto; width:100%; }
        #${ROOT_ID}[data-rating-density="compact"] .rating-planfact-board { grid-template-columns:1fr; }
        .rating-note-dialog__fields { grid-template-columns:1fr; }
        #${ROOT_ID} .rating-work-table table.rating-ux-wide-table th:nth-child(2),
        #${ROOT_ID} .rating-work-table table.rating-ux-wide-table td:nth-child(2) {
          position:static;
          box-shadow:none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function setDensity(root, value) {
    const density = value === 'full' ? 'full' : 'compact';
    root.dataset.ratingDensity = density;
    storageSet(DENSITY_KEY, density);
    root.querySelectorAll('[data-rating-density-value]').forEach((button) => {
      const active = button.dataset.ratingDensityValue === density;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function ensureToolbar(root) {
    let toolbar = root.querySelector('[data-rating-feedback-toolbar]');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'rating-feedback-toolbar';
      toolbar.setAttribute('data-rating-feedback-toolbar', '');
      toolbar.innerHTML = `
        <div class="rating-feedback-toolbar__main">
          <div class="rating-density-switch" aria-label="Плотность экрана">
            <button type="button" data-rating-density-value="compact">Компактно</button>
            <button type="button" data-rating-density-value="full">Все показатели</button>
          </div>
          <label class="rating-workflow-filter">
            <span>Работа команды</span>
            <select class="rating-ux-select" data-rating-workflow-filter aria-label="Статус работы команды">
              <option value="all">Все статусы</option>
              <option value="mine">Мои карточки</option>
              <option value="overdue">Просрочено</option>
              <option value="none">Без статуса</option>
              <option value="new">Новый</option>
              <option value="progress">В работе</option>
              <option value="waiting">Ждём ответ</option>
              <option value="done">Готово</option>
            </select>
          </label>
          <div class="rating-api-truth">
            <strong>Ozon:</strong> рейтинг — ориентир из реестра; отзывы и негатив недоступны по текущему API (403).
          </div>
          <span class="rating-team-sync" data-rating-team-sync></span>
          <div class="rating-data-refresh" data-rating-data-refresh-panel>
            <button type="button" data-rating-data-refresh>Обновить отзывы и вопросы</button>
            <div class="rating-data-refresh__meta" data-rating-data-freshness></div>
            <div class="rating-data-refresh__status" data-rating-data-refresh-status></div>
          </div>
        </div>
        <div class="rating-action-guide">
          <strong>Действия по артикулу:</strong>
          артикул копируется в первом столбце, а заметка для коллег — в отдельной колонке «Комментарий команде», как в Google-таблице.
        </div>
      `;
      const title = root.querySelector(':scope > .section-title');
      if (title) title.insertAdjacentElement('afterend', toolbar);
      else root.prepend(toolbar);
      toolbar.querySelectorAll('[data-rating-density-value]').forEach((button) => {
        button.addEventListener('click', () => setDensity(root, button.dataset.ratingDensityValue));
      });
      toolbar.querySelector('[data-rating-workflow-filter]')?.addEventListener('change', (event) => {
        setWorkflowFilter(root, event.target.value);
      });
      toolbar.querySelector('[data-rating-data-refresh]')?.addEventListener('click', (event) => {
        requestWbFeedbackSync(event.currentTarget);
      });
    }
    setDensity(root, currentDensity());
    const workflowSelect = toolbar.querySelector('[data-rating-workflow-filter]');
    if (workflowSelect) workflowSelect.value = workflowFilter;
    const sync = toolbar.querySelector('[data-rating-team-sync]');
    if (sync) {
      const remote = remoteWorkflowAvailable();
      sync.classList.toggle('is-local', !remote);
      sync.textContent = remote ? 'Общие комментарии синхронизируются' : 'Офлайн: изменения в очереди синхронизации';
    }
    updateRatingDataSyncUi(root);
  }

  function setWorkflowFilter(root, value) {
    workflowFilter = WORKFLOW_FILTER_LABELS[value] ? value : 'all';
    const select = root?.querySelector('[data-rating-workflow-filter]');
    if (select) select.value = workflowFilter;
    if (typeof window.renderWbCardRating === 'function') {
      window.requestAnimationFrame(() => window.renderWbCardRating(ROOT_ID));
      return;
    }
    applyRowWorkflowFilter(root);
    ensureSmartBoard(root);
  }

  function rowSmartPriority(row, workflow) {
    if (workflowIsOverdue(workflow)) return 'overdue';
    const text = normalizeKey(row?.textContent || '');
    if (/(нужен_ответ|без_ответа|риск|негатив|падает|просел|критич)/u.test(text)) return 'critical';
    return 'normal';
  }

  function smartBoardSummary({ urgent, overdue, mine, platform, stale }) {
    const platformLabel = platform === 'ozon' ? 'Ozon' : 'WB';
    if (platform === 'wb' && stale) {
      return '<strong>Снимок устарел.</strong> Сначала обновите отзывы и вопросы — текущие хвосты могут уже не совпадать с кабинетом WB.';
    }
    if (overdue > 0) {
      return `<strong>${overdue} просрочено.</strong> Начните с них, затем разберите ${urgent} карточек с сигналами риска на ${platformLabel}.`;
    }
    if (urgent > 0) {
      return `<strong>${urgent} требуют внимания.</strong> Сначала ответы и негатив, затем карточки в личной очереди (${mine}).`;
    }
    return `<strong>Критичных просрочек нет.</strong> Очередь ${platformLabel} спокойная; проверьте личные карточки и свежие отзывы.`;
  }

  function ensureSmartBoard(root) {
    if (!root) return;
    const platform = root.dataset.ratingPlatformCurrent === 'ozon' ? 'ozon' : 'wb';
    const stale = root.dataset.ratingDataStale === '1';
    const rows = [...root.querySelectorAll('.rating-work-row')];
    const catalog = workflowCatalog(platform);
    const counts = {
      all: rows.length,
      urgent: rows.filter((row) => row.dataset.ratingSmartPriority === 'critical').length,
      mine: catalog.filter(workflowIsMine).length,
      overdue: catalog.filter(workflowIsOverdue).length,
      progress: catalog.filter((entry) => entry.status === 'progress').length,
      none: rows.filter((row) => row.dataset.ratingWorkflowStatus === 'none').length
    };
    const signature = JSON.stringify([platform, workflowFilter, stale, ...Object.values(counts)]);
    let board = root.querySelector('[data-rating-smart-board]');
    if (!board) {
      board = document.createElement('section');
      board.className = 'rating-smart-board';
      board.setAttribute('data-rating-smart-board', '');
      const toolbar = root.querySelector('[data-rating-feedback-toolbar]');
      if (toolbar) toolbar.insertAdjacentElement('afterend', board);
      else root.prepend(board);
    }
    if (board.dataset.ratingSmartSignature === signature) return;
    board.dataset.ratingSmartSignature = signature;
    const cards = [
      { filter: 'all', label: 'На экране', value: counts.all, hint: `${counts.urgent} требуют внимания`, tone: counts.urgent ? 'gold' : '' },
      { filter: 'mine', label: 'Мои карточки', value: counts.mine, hint: 'назначены мне', tone: 'gold' },
      { filter: 'overdue', label: 'Просрочено', value: counts.overdue, hint: 'нужна реакция', tone: counts.overdue ? 'danger' : '' },
      { filter: 'progress', label: 'В работе', value: counts.progress, hint: 'активные решения', tone: '' },
      { filter: 'none', label: 'Без статуса', value: counts.none, hint: 'ещё не разобраны', tone: '' }
    ];
    board.innerHTML = `
      <div class="rating-smart-board__copy">
        <span class="rating-smart-board__eyebrow">Altea Review Intelligence</span>
        <h3>Приоритет команды на сегодня</h3>
        <p class="rating-smart-board__summary">
          ${smartBoardSummary({ urgent: counts.urgent, overdue: counts.overdue, mine: counts.mine, platform, stale })}
        </p>
      </div>
      <div class="rating-smart-kpis" aria-label="Быстрые фильтры умной очереди">
        ${cards.map((card) => `
          <button
            type="button"
            class="rating-smart-kpi${workflowFilter === card.filter ? ' is-active' : ''}"
            data-rating-smart-filter="${card.filter}"
            data-tone="${card.tone}"
            aria-pressed="${workflowFilter === card.filter ? 'true' : 'false'}"
          >
            <span class="rating-smart-kpi__label">${escapeHtml(card.label)}</span>
            <strong class="rating-smart-kpi__value">${escapeHtml(card.value)}</strong>
            <span class="rating-smart-kpi__hint">${escapeHtml(card.hint)}</span>
          </button>
        `).join('')}
      </div>
    `;
    board.querySelectorAll('[data-rating-smart-filter]').forEach((button) => {
      button.addEventListener('click', () => setWorkflowFilter(root, button.dataset.ratingSmartFilter));
    });
  }

  function groupForSort(value) {
    if (/^reviews/.test(value)) return 'Отзывы';
    if (/^rating/.test(value)) return 'Рейтинг';
    if (/^negative/.test(value)) return 'Негатив';
    if (/^questions?/.test(value)) return 'Вопросы';
    if (/^review/.test(value)) return 'Отзывы';
    if (/^question/.test(value)) return 'Вопросы';
    return 'Приоритет';
  }

  function collapseControl(control) {
    if (control.querySelector('[data-rating-ux-select]')) return;
    const buttons = [...control.querySelectorAll(':scope > button[data-rating-sort], :scope > button[data-rating-status]')];
    if (buttons.length < 3) return;
    const kind = buttons[0].hasAttribute('data-rating-status') ? 'status' : 'sort';
    const select = document.createElement('select');
    select.className = 'rating-ux-select';
    select.setAttribute('data-rating-ux-select', kind);
    select.setAttribute('aria-label', kind === 'status' ? 'Фильтр' : 'Сортировка');

    if (kind === 'sort') {
      const groups = new Map();
      buttons.forEach((button) => {
        const value = button.dataset.ratingSort || '';
        const group = groupForSort(value);
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(button);
      });
      groups.forEach((items, label) => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = label;
        items.forEach((button) => {
          const option = document.createElement('option');
          option.value = button.dataset.ratingSort || '';
          option.textContent = button.textContent.trim();
          option.selected = button.classList.contains('active');
          optgroup.appendChild(option);
        });
        select.appendChild(optgroup);
      });
    } else {
      buttons.forEach((button) => {
        const option = document.createElement('option');
        option.value = button.dataset.ratingStatus || '';
        option.textContent = button.textContent.trim();
        option.selected = button.classList.contains('active');
        select.appendChild(option);
      });
    }

    select.addEventListener('change', () => {
      const attribute = kind === 'status' ? 'data-rating-status' : 'data-rating-sort';
      const target = [...control.querySelectorAll(`:scope > button[${attribute}]`)]
        .find((button) => button.getAttribute(attribute) === select.value);
      if (target) target.click();
    });
    control.classList.add('rating-ux-collapsed');
    control.appendChild(select);
  }

  function copyText(value, button) {
    const finish = () => {
      const previous = button.textContent;
      button.textContent = 'Артикул скопирован';
      button.classList.add('is-copied');
      window.setTimeout(() => {
        button.textContent = previous;
        button.classList.remove('is-copied');
      }, 1200);
    };
    const fail = () => {
      const previous = button.textContent;
      button.textContent = 'Буфер недоступен';
      window.setTimeout(() => {
        button.textContent = previous;
      }, 1600);
    };
    if (window.navigator?.clipboard?.writeText) {
      window.navigator.clipboard.writeText(value).then(finish).catch(() => fallbackCopy(value, finish, fail));
      return;
    }
    fallbackCopy(value, finish, fail);
  }

  function fallbackCopy(value, onDone, onFail) {
    const field = document.createElement('textarea');
    let copied = false;
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    try {
      copied = typeof document.execCommand === 'function' && document.execCommand('copy');
    } catch (error) {
      copied = false;
    } finally {
      field.remove();
    }
    if (copied) onDone();
    else onFail();
  }

  function formatWorkflowDate(value) {
    const parsed = Date.parse(value || '');
    if (!Number.isFinite(parsed)) return 'без даты';
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(parsed));
  }

  function workflowHistoryHtml(entries) {
    if (!entries.length) {
      return '<div class="rating-note-history__item"><p>Отзывов и комментариев пока нет. Первая запись будет видна всей команде.</p></div>';
    }
    return entries.slice(0, 30).map((entry) => `
      <article class="rating-note-history__item">
        <div class="rating-note-history__meta">
          <strong>${escapeHtml(entry.author)}</strong>
          <span>${escapeHtml(formatWorkflowDate(entry.createdAt))}</span>
        </div>
        <p>${escapeHtml(entry.text || 'Статус обновлён без комментария.')}</p>
        <small>
          ${escapeHtml(ENTRY_LABELS[entry.entryKind] || ENTRY_LABELS.comment)}
          · ${escapeHtml(STATUS_LABELS[entry.status] || STATUS_LABELS.new)}
          ${entry.owner ? ` · ответственный ${escapeHtml(entry.owner)}` : ''}
          ${entry.due ? ` · срок ${escapeHtml(entry.due)}` : ''}
        </small>
      </article>
    `).join('');
  }

  function refreshWorkflowRows() {
    document.querySelectorAll('[data-rating-row-actions]').forEach((actions) => actions.remove());
    document.querySelectorAll('[data-rating-comment-cell]').forEach((cell) => cell.remove());
    enhanceRoot(document.getElementById(ROOT_ID));
  }

  function showWorkflowNotice(message, isError = false) {
    if (typeof window.setAppError === 'function') {
      window.setAppError(message);
      window.setTimeout(() => window.setAppError(''), isError ? 3200 : 1800);
    }
  }

  function openNoteDialog(key, label, platform = 'wb') {
    document.querySelector('.rating-note-backdrop')?.remove();
    const platformKey = platform === 'ozon' ? 'ozon' : 'wb';
    const entries = workflowEntries(platformKey, key);
    const current = entries[0] || {
      text: '',
      status: 'new',
      entryKind: 'comment',
      owner: currentMemberName(),
      due: ''
    };
    const backdrop = document.createElement('div');
    backdrop.className = 'rating-note-backdrop';
    backdrop.innerHTML = `
      <form class="rating-note-dialog" data-rating-note-form>
        <div class="rating-note-dialog__head">
          <div>
            <h3>Комментарий по артикулу</h3>
            <span>${platformKey === 'ozon' ? 'Ozon' : 'WB'} · артикул ${escapeHtml(label || key)} · видно всей команде</span>
          </div>
          <button type="button" data-rating-note-cancel aria-label="Закрыть">Закрыть</button>
        </div>
        <div class="rating-note-dialog__body">
          <div class="rating-note-dialog__fields">
            <label>
              Тип записи
              <select data-rating-note-kind>
                <option value="feedback">Отзыв по артикулу</option>
                <option value="comment">Комментарий для команды</option>
              </select>
            </label>
            <label>
              Статус
              <select data-rating-note-status>
                <option value="new">Новый</option>
                <option value="progress">В работе</option>
                <option value="waiting">Ждём ответ</option>
                <option value="done">Готово</option>
              </select>
            </label>
            <label>
              Ответственный
              <input data-rating-note-owner maxlength="120" placeholder="Имя сотрудника">
            </label>
            <label>
              Срок
              <input type="date" data-rating-note-due>
            </label>
          </div>
          <label>
            Текст отзыва / комментария
            <textarea data-rating-note-text placeholder="Напишите коллегам, что заметили по артикулу и какой нужен следующий шаг"></textarea>
          </label>
          <div class="rating-note-form-error" data-rating-note-error></div>
          <div class="rating-note-sync-hint">
            <strong>Это внутренняя запись для коллег — покупателю на WB/Ozon она не отправляется.</strong><br>
            ${remoteWorkflowAvailable()
              ? 'После сохранения запись попадёт в общий журнал Supabase и будет видна сотрудникам.'
              : 'Сейчас портал офлайн: запись сохранится локально и отправится при восстановлении командной синхронизации.'}
          </div>
          <div class="rating-note-history">
            <h4>Отзывы и комментарии · ${entries.length}</h4>
            ${workflowHistoryHtml(entries)}
          </div>
        </div>
        <div class="rating-note-dialog__actions">
          <button type="button" data-rating-note-cancel>Отмена</button>
          <button type="submit" data-rating-note-save>Сохранить для команды</button>
        </div>
      </form>
    `;
    const textarea = backdrop.querySelector('[data-rating-note-text]');
    const entryKind = backdrop.querySelector('[data-rating-note-kind]');
    const status = backdrop.querySelector('[data-rating-note-status]');
    const owner = backdrop.querySelector('[data-rating-note-owner]');
    const due = backdrop.querySelector('[data-rating-note-due]');
    const errorBox = backdrop.querySelector('[data-rating-note-error]');
    textarea.value = '';
    entryKind.value = ENTRY_LABELS[current.entryKind] ? current.entryKind : 'comment';
    status.value = STATUS_LABELS[current.status] ? current.status : 'new';
    owner.value = current.owner || currentMemberName();
    due.value = /^\d{4}-\d{2}-\d{2}$/.test(current.due || '') ? current.due : '';
    const close = () => backdrop.remove();
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        document.removeEventListener('keydown', handleKey);
        close();
      }
    };
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop || event.target.closest('[data-rating-note-cancel]')) {
        document.removeEventListener('keydown', handleKey);
        close();
      }
    });
    backdrop.querySelector('[data-rating-note-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const nextText = textarea.value.trim();
      const nextEntryKind = ENTRY_LABELS[entryKind.value] ? entryKind.value : 'comment';
      const nextStatus = STATUS_LABELS[status.value] ? status.value : 'new';
      const nextOwner = owner.value.trim();
      const nextDue = due.value;
      const changed = nextEntryKind !== current.entryKind
        || nextStatus !== current.status
        || nextOwner !== (current.owner || '')
        || nextDue !== (current.due || '');
      if (!nextText && !changed) {
        errorBox.textContent = 'Добавьте текст отзыва / комментария или измените параметры работы.';
        return;
      }
      if (typeof window.createComment !== 'function') {
        errorBox.textContent = 'Командный контур комментариев ещё не загрузился. Обновите экран через несколько секунд.';
        return;
      }

      const saveButton = backdrop.querySelector('[data-rating-note-save]');
      saveButton.disabled = true;
      saveButton.textContent = 'Сохраняем…';
      errorBox.textContent = '';
      const beforeIds = new Set(entries.map((entry) => entry.id));
      try {
        await window.createComment({
          articleKey: String(key || label || '').trim(),
          author: currentMemberName(),
          team: currentTeamLabel(),
          type: WORKFLOW_TYPE,
          text: workflowPayload({
            platform: platformKey,
            status: nextStatus,
            entryKind: nextEntryKind,
            owner: nextOwner,
            due: nextDue,
            text: nextText
          })
        });
        document.removeEventListener('keydown', handleKey);
        close();
        refreshWorkflowRows();
        showWorkflowNotice('Отзыв / комментарий сохранён для команды.');
      } catch (error) {
        const queued = workflowEntries(platformKey, key).some((entry) => !beforeIds.has(entry.id));
        if (queued) {
          document.removeEventListener('keydown', handleKey);
          close();
          refreshWorkflowRows();
          showWorkflowNotice('Запись сохранена локально и ожидает синхронизации.');
        } else {
          errorBox.textContent = 'Не удалось сохранить запись. Проверьте подключение и повторите.';
          saveButton.disabled = false;
          saveButton.textContent = 'Сохранить для команды';
        }
      }
    });
    document.addEventListener('keydown', handleKey);
    document.body.appendChild(backdrop);
    textarea.focus();
  }

  function applyRowWorkflowFilter(root) {
    root.querySelectorAll('.rating-work-row').forEach((row) => {
      const articleKey = row.dataset.ratingWorkflowArticle || row.dataset.ratingDetail || '';
      const platform = row.dataset.ratingWorkflowPlatform || row.dataset.ratingPlatform || 'wb';
      row.classList.toggle('is-workflow-filtered', !workflowMatches(articleKey, platform));
    });
  }

  function addRowActions(root) {
    root.querySelectorAll('.rating-work-row .article-cell').forEach((cell) => {
      if (cell.querySelector('[data-rating-row-actions]')) return;
      const row = cell.closest('.rating-work-row');
      const label = row?.dataset.ratingDetail
        || cell.querySelector('.link-btn, strong')?.textContent?.trim()
        || cell.textContent.trim().split('\n')[0];
      if (!label) return;
      const platform = row?.dataset.ratingPlatform
        || root.dataset.ratingPlatformCurrent
        || 'wb';
      const entries = workflowEntries(platform, label);
      const workflow = entries[0] || null;
      const priority = rowSmartPriority(row, workflow);
      const table = row?.closest('table');
      const headerRow = table?.querySelector('thead tr');
      if (table && headerRow && !headerRow.querySelector('[data-rating-comment-head]')) {
        const commentHead = document.createElement('th');
        commentHead.className = 'rating-team-comment-head';
        commentHead.setAttribute('data-rating-comment-head', '');
        commentHead.innerHTML = '<span>Комментарий команде</span><small>общая колонка, как в Google-таблице</small>';
        headerRow.firstElementChild?.insertAdjacentElement('afterend', commentHead);
        table.classList.add('rating-has-comment-column');
      }
      if (row) {
        row.dataset.ratingWorkflowStatus = workflow?.status || 'none';
        row.dataset.ratingWorkflowArticle = label;
        row.dataset.ratingWorkflowPlatform = platform;
        row.dataset.ratingSmartPriority = priority;
      }
      const actions = document.createElement('div');
      actions.className = 'rating-row-actions';
      actions.setAttribute('data-rating-row-actions', '');
      actions.innerHTML = `
        <button class="rating-copy-button" type="button" data-rating-copy>Копировать артикул</button>
        ${priority === 'overdue' ? '<span class="rating-priority-flag">Просрочено</span>' : ''}
        ${priority === 'critical' ? '<span class="rating-priority-flag">Нужно внимание</span>' : ''}
        ${workflow ? `<span class="rating-workflow-status" data-status="${workflow.status}">${escapeHtml(STATUS_LABELS[workflow.status] || STATUS_LABELS.new)}</span>` : ''}
        ${workflow?.owner ? `<span class="rating-row-owner" title="Ответственный">${escapeHtml(workflow.owner)}</span>` : ''}
      `;
      let commentCell = row?.querySelector(':scope > [data-rating-comment-cell]');
      if (row && !commentCell) {
        commentCell = document.createElement('td');
        commentCell.className = 'rating-team-comment-cell';
        commentCell.setAttribute('data-rating-comment-cell', '');
        cell.insertAdjacentElement('afterend', commentCell);
      }
      if (commentCell) {
        commentCell.innerHTML = `
          <div class="rating-team-comment-box" data-has-comment="${workflow ? '1' : '0'}">
            <button class="rating-note-button" type="button" data-rating-note data-note-status="${workflow?.status || 'new'}">
              ${workflow ? `Открыть / добавить · ${entries.length}` : 'Добавить комментарий'}
            </button>
            ${workflow
              ? `<span class="rating-team-comment-preview">${escapeHtml(workflow.text || 'Статус обновлён без текста.')}</span>
                 <span class="rating-team-comment-meta">Сохранено · ${escapeHtml(STATUS_LABELS[workflow.status] || STATUS_LABELS.new)}${workflow.owner ? ` · ${escapeHtml(workflow.owner)}` : ''}</span>`
              : '<span class="rating-team-comment-placeholder">Нажмите и напишите коллегам заметку по этому артикулу.</span>'}
          </div>
        `;
      }
      actions.querySelector('[data-rating-copy]').addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        copyText(label, event.currentTarget);
      });
      commentCell?.querySelector('[data-rating-note]')?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openNoteDialog(label, label, platform);
      });
      cell.appendChild(actions);
    });
    applyRowWorkflowFilter(root);
  }

  function markWideTables(root) {
    root.querySelectorAll('.rating-work-table table').forEach((table) => {
      table.classList.toggle('rating-ux-wide-table', table.querySelectorAll('thead th').length >= 10);
    });
  }

  function enhanceRoot(root) {
    if (!root) return;
    ensureStyles();
    const activePlatform = root.querySelector('.rating-platform-selector [data-rating-platform].active')
      || root.querySelector('.rating-planfact-toolbar [data-rating-platform].active');
    root.dataset.ratingPlatformCurrent = activePlatform?.dataset.ratingPlatform === 'ozon' ? 'ozon' : 'wb';
    ensureToolbar(root);
    root.querySelectorAll('.rating-sort-control').forEach(collapseControl);
    markWideTables(root);
    addRowActions(root);
    ensureSmartBoard(root);
  }

  function scheduleEnhance() {
    if (enhanceScheduled) return;
    enhanceScheduled = true;
    window.requestAnimationFrame(() => {
      enhanceScheduled = false;
      enhanceRoot(document.getElementById(ROOT_ID));
    });
  }

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type === 'childList' && mutation.addedNodes.length)) {
      scheduleEnhance();
    }
  });

  function boot() {
    ensureStyles();
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    observer.observe(root, { childList: true, subtree: true });
    scheduleEnhance();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
  ['hashchange', 'altea:viewchange', 'altea:data-ready', 'altea:app-ready', 'altea:portal-storage-updated'].forEach((eventName) => {
    window.addEventListener(eventName, scheduleEnhance);
  });
})();
