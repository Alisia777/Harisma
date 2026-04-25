(function () {
  if (window.__ALTEA_REPRICER_SETTINGS_UX_HOTFIX_20260425A__) return;
  window.__ALTEA_REPRICER_SETTINGS_UX_HOTFIX_20260425A__ = true;

  const STORAGE_KEY = 'altea-repricer-ux-state-v1';
  const PORTAL_STORAGE_KEY = 'brand-portal-local-v1';
  const SECTION_HELP = {
    global: 'База для всего контура: маржа, целевая оборачиваемость, launch, OOS и deadband.',
    brands: 'Переопределяет общие правила для конкретного бренда.',
    statuses: 'Определяет, что разрешено для каждого статуса: auto, launch, freeze и alignment.',
    roles: 'Задает скорость оборота и чувствительность репрайсера по SKU-роли.',
    fees: 'Комиссии и прямые расходы по площадкам для расчета economic floor.'
  };

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object'
        ? parsed
        : { sections: {}, history: {} };
    } catch (error) {
      console.warn('[repricer-settings-ux] load state failed', error);
      return { sections: {}, history: {} };
    }
  }

  function saveState(next) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn('[repricer-settings-ux] save state failed', error);
    }
  }

  function ensureStateBucket(bucket) {
    const state = loadState();
    if (!state[bucket] || typeof state[bucket] !== 'object') state[bucket] = {};
    return state;
  }

  function isOpen(bucket, key, fallback) {
    const state = loadState();
    if (!state[bucket] || typeof state[bucket] !== 'object') return fallback;
    if (state[bucket][key] === undefined) return fallback;
    return Boolean(state[bucket][key]);
  }

  function setOpen(bucket, key, value) {
    const state = ensureStateBucket(bucket);
    state[bucket][key] = Boolean(value);
    saveState(state);
  }

  function canonicalBrand(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const normalized = raw.toLowerCase();
    if (normalized === 'altea' || normalized === 'алтея') return 'Алтея';
    if (normalized === 'cpa') return 'CPA';
    if (normalized === 'harly' || normalized === 'harley') return '';
    return raw;
  }

  function loadPortalStorage() {
    try {
      const raw = window.localStorage.getItem(PORTAL_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      console.warn('[repricer-settings-ux] load portal storage failed', error);
      return {};
    }
  }

  function repricerSavedAtLabel() {
    const storage = loadPortalStorage();
    const updatedAt = storage?.repricerSettingsUpdatedAt || '';
    if (!updatedAt) return 'еще не сохранено';
    if (window.fmt?.date) return window.fmt.date(updatedAt);
    try {
      return new Date(updatedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return String(updatedAt);
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

  function labelForField(input) {
    const name = String(input?.name || '').trim();
    const inBrand = Boolean(input.closest('[data-repricer-brand-card]'));
    const inRole = Boolean(input.closest('[data-repricer-role-card]'));

    if (name === 'minMarginPct') return 'Мин. маржа, %';
    if (name === 'defaultTargetDays') return 'Цель по обороту, дн.';
    if (name === 'launchTargetDays') return 'Цель для launch, дн.';
    if (name === 'oosDays') return 'Порог OOS, дн.';
    if (name === 'deadbandPct') return 'Deadband, %';
    if (name === 'deadbandRub') return 'Deadband, ₽';
    if (name === 'mode') return 'Режим';
    if (name === 'allowAutoprice') return 'AUTO';
    if (name === 'allowLaunch') return 'Launch';
    if (name === 'allowAlignment') return 'Alignment';
    if (name === 'targetDays') return inRole ? 'Цель, дн.' : 'Цель, дн.';
    if (name === 'minLiftPct') return 'Мин. lift, %';
    if (name === 'stretchMultiplier') return 'Stretch';
    if (name === 'elasticityDefault') return 'Elasticity';
    if (name === 'allowVolumePush') return 'Volume push';
    if (name === 'commissionPct') return 'Комиссия, %';
    if (name === 'logisticsRub') return 'Логистика, ₽';
    if (name === 'storageRub') return 'Хранение, ₽';
    if (name === 'adRub') return 'Реклама, ₽';
    if (name === 'returnsRub') return 'Возвраты, ₽';
    if (name === 'otherRub') return 'Прочее, ₽';
    if (name === 'alignmentEnabled') return inBrand ? 'Разрешить alignment' : 'Разрешить alignment WB/Ozon по score-модели';
    return String(input?.placeholder || '').trim() || 'Параметр';
  }

  function ensureFieldLabel(input) {
    if (!(input instanceof HTMLElement)) return;
    const labelText = labelForField(input);
    if (!labelText) return;

    if (input.type === 'checkbox') {
      const host = input.closest('label');
      if (!host || host.dataset.repricerUxLabeled === 'true') return;
      host.dataset.repricerUxLabeled = 'true';
      const textNodes = Array.from(host.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE && String(node.textContent || '').trim());
      if (!host.querySelector('[data-repricer-ux-checkbox-label]')) {
        const badge = document.createElement('span');
        badge.className = 'muted small';
        badge.dataset.repricerUxCheckboxLabel = 'true';
        badge.textContent = labelText;
        host.insertBefore(badge, host.firstChild);
      }
      textNodes.forEach((node) => {
        const text = String(node.textContent || '').trim();
        if (!text) return;
        const caption = document.createElement('span');
        caption.className = 'muted small';
        caption.textContent = text;
        host.replaceChild(caption, node);
      });
      if (!host.style.display) host.style.display = 'grid';
      host.style.gap = '6px';
      host.style.alignItems = 'start';
      return;
    }

    const wrapper = input.parentElement;
    if (!wrapper || wrapper.dataset.repricerUxField === 'true') return;
    const field = document.createElement('label');
    field.dataset.repricerUxField = 'true';
    field.style.display = 'grid';
    field.style.gap = '6px';

    const title = document.createElement('span');
    title.className = 'muted small';
    title.textContent = labelText;

    wrapper.replaceChild(field, input);
    field.appendChild(title);
    field.appendChild(input);
  }

  function detailsSummary(title, meta) {
    return `
      <summary style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:12px">
        <span><strong>${escapeHtml(title)}</strong></span>
        ${meta ? `<span class="muted small">${escapeHtml(meta)}</span>` : ''}
      </summary>
    `;
  }

  function sectionMetaFromContent(sectionId, body) {
    if (sectionId === 'brands') {
      const count = body.querySelectorAll('[data-repricer-brand-card]').length;
      return `${count} брендов`;
    }
    if (sectionId === 'statuses') {
      const count = body.querySelectorAll('[data-repricer-status-card]').length;
      return `${count} статусов`;
    }
    if (sectionId === 'roles') {
      const count = body.querySelectorAll('[data-repricer-role-card]').length;
      return `${count} ролей`;
    }
    if (sectionId === 'fees') {
      const count = body.querySelectorAll('[data-repricer-fee-card]').length;
      return `${count} площадок`;
    }
    return '';
  }

  function attachTogglePersistence(details, bucket, key) {
    if (!details || details.dataset.repricerUxToggleBound === 'true') return;
    details.dataset.repricerUxToggleBound = 'true';
    details.addEventListener('toggle', () => setOpen(bucket, key, details.open));
  }

  function buildSection(sectionId, title, bodyNodes, defaultOpen) {
    const details = document.createElement('details');
    details.dataset.repricerUxSection = sectionId;
    details.open = isOpen('sections', sectionId, defaultOpen);
    details.className = 'owner-cell';
    details.style.display = 'grid';
    details.style.gap = '10px';
    details.style.marginTop = '14px';

    const body = document.createElement('div');
    body.style.display = 'grid';
    body.style.gap = '12px';
    body.style.marginTop = '10px';
    bodyNodes.forEach((node) => body.appendChild(node));

    const meta = sectionMetaFromContent(sectionId, body);
    details.innerHTML = detailsSummary(title, meta);

    const help = document.createElement('div');
    help.className = 'muted small';
    help.textContent = SECTION_HELP[sectionId] || '';

    const content = document.createElement('div');
    content.style.display = 'grid';
    content.style.gap = '10px';
    content.appendChild(help);
    content.appendChild(body);
    details.appendChild(content);

    attachTogglePersistence(details, 'sections', sectionId);
    return details;
  }

  function buildInfoLine() {
    const wrapper = document.createElement('div');
    wrapper.className = 'owner-cell';
    wrapper.dataset.repricerUxIntro = 'true';
    wrapper.style.display = 'grid';
    wrapper.style.gap = '8px';
    wrapper.style.marginTop = '10px';

    const remote = typeof window.hasRemoteStore === 'function' && window.hasRemoteStore();
    const updatedAt = repricerSavedAtLabel();

    wrapper.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap">
        <div>
          <strong>Это общие правила репрайсера</strong>
          <div class="muted small" style="margin-top:6px">Они влияют на весь контур, а не на одну SKU. Точечные промо и коридоры задаются ниже, в карточках SKU и площадок.</div>
        </div>
        <div class="badge-stack">
          <span class="chip ok">автосохранение</span>
          <span class="chip info">${remote ? 'локально и в командной базе' : 'локально'}</span>
          <span class="chip" data-repricer-ux-save-badge>сохранено ${escapeHtml(updatedAt)}</span>
        </div>
      </div>
    `;
    return wrapper;
  }

  function updateSaveBadge(root) {
    const badge = root?.querySelector?.('[data-repricer-ux-save-badge]');
    if (!badge) return;
    badge.textContent = `сохранено ${repricerSavedAtLabel()}`;
  }

  function normalizeBrandCards(form) {
    const seen = new Set();
    form.querySelectorAll('[data-repricer-brand-card]').forEach((card) => {
      const rawBrand = card.getAttribute('data-repricer-brand-card') || '';
      const brand = canonicalBrand(rawBrand);
      if (!brand || seen.has(brand)) {
        card.remove();
        return;
      }
      seen.add(brand);
      card.setAttribute('data-repricer-brand-card', brand);
      const title = card.querySelector('strong');
      if (title) title.textContent = brand;
    });
  }

  function normalizeBrandChips(root) {
    root.querySelectorAll('.chip').forEach((chip) => {
      const text = String(chip.textContent || '').trim();
      if (!text) return;
      const brand = canonicalBrand(text);
      if (text === 'Harly' || text === 'Harley') {
        chip.remove();
        return;
      }
      if (brand && brand !== text) chip.textContent = brand;
    });
  }

  function enhanceSettingsForm(root) {
    const form = root.querySelector('#repricerSettingsForm');
    if (!form || form.dataset.repricerUxEnhanced === 'true') {
      updateSaveBadge(root);
      return;
    }

    normalizeBrandCards(form);
    normalizeBrandChips(root);

    const submitRow = form.querySelector('.quick-actions');
    const allChildren = Array.from(form.children);
    const generalFilters = allChildren.find((node) => node.classList?.contains('filters'));
    const generalAlignment = allChildren.find((node) => node !== generalFilters && node.querySelector?.('input[name="alignmentEnabled"]'));
    const brandStack = allChildren.find((node) => node.querySelector?.('[data-repricer-brand-card]'));
    const statusStack = allChildren.find((node) => node.querySelector?.('[data-repricer-status-card]'));
    const roleStack = allChildren.find((node) => node.querySelector?.('[data-repricer-role-card]'));
    const feeStack = allChildren.find((node) => node.querySelector?.('[data-repricer-fee-card]'));

    form.innerHTML = '';
    form.appendChild(buildInfoLine());

    const generalNodes = [];
    if (generalFilters) generalNodes.push(generalFilters);
    if (generalAlignment) generalNodes.push(generalAlignment);
    form.appendChild(buildSection('global', 'Общие правила', generalNodes, true));

    [
      ['brands', 'Правила брендов', brandStack],
      ['statuses', 'Карта статусов', statusStack],
      ['roles', 'Правила ролей SKU', roleStack],
      ['fees', 'Fee stack по площадкам', feeStack]
    ].forEach(([sectionId, title, stack]) => {
      if (!stack) return;
      const caption = stack.firstElementChild;
      if (caption && caption.classList.contains('muted')) caption.remove();
      form.appendChild(buildSection(sectionId, title, [stack], false));
    });

    if (submitRow) form.appendChild(submitRow);

    form.querySelectorAll('input, select, textarea').forEach(ensureFieldLabel);
    form.dataset.repricerUxEnhanced = 'true';

    let autosaveTimer = null;
    const runAutosave = () => {
      window.clearTimeout(autosaveTimer);
      autosaveTimer = window.setTimeout(() => {
        try {
          if (typeof window.saveRepricerSettings === 'function') {
            window.saveRepricerSettings(form);
          }
        } catch (error) {
          console.warn('[repricer-settings-ux] autosave failed', error);
        }
        window.setTimeout(() => updateSaveBadge(root), 80);
      }, 250);
    };

    if (form.dataset.repricerUxAutosaveBound !== 'true') {
      form.dataset.repricerUxAutosaveBound = 'true';
      form.addEventListener('change', runAutosave);
      form.addEventListener('input', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.type === 'number') runAutosave();
      });
    }
    updateSaveBadge(root);
  }

  function historyKey(side) {
    const card = side.closest('.repricer-card');
    const articleKey = card?.querySelector('[data-open-sku]')?.getAttribute('data-open-sku') || 'repricer';
    const head = side.querySelector('.repricer-side-head');
    const platform = String(head?.childNodes?.[0]?.textContent || '').trim() || 'platform';
    return `${articleKey}:${platform}`;
  }

  function buildHistory(side, nodes) {
    const key = historyKey(side);
    const details = document.createElement('details');
    details.dataset.repricerUxHistory = key;
    details.open = isOpen('history', key, false);
    details.style.marginTop = '8px';

    const headline = nodes[0]?.textContent?.trim() || 'история';
    const context = nodes[1]?.textContent?.trim() || '';
    details.innerHTML = `
      <summary class="small muted" style="cursor:pointer">
        История и источники${headline ? ` · ${escapeHtml(headline)}` : ''}${context ? ` · ${escapeHtml(context)}` : ''}
      </summary>
    `;

    const body = document.createElement('div');
    body.className = 'stack';
    body.style.marginTop = '10px';
    body.style.gap = '6px';
    nodes.forEach((node) => body.appendChild(node));
    details.appendChild(body);
    attachTogglePersistence(details, 'history', key);
    return details;
  }

  function enhanceHistory(root) {
    root.querySelectorAll('.repricer-side').forEach((side) => {
      if (side.dataset.repricerUxHistoryEnhanced === 'true') return;
      const directInfoNodes = Array.from(side.children)
        .filter((node) => node.matches?.('.muted.small'))
        .filter((node) => !node.closest('[data-repricer-ux-history]'))
        .filter((node) => !node.closest('details'));
      if (!directInfoNodes.length) {
        side.dataset.repricerUxHistoryEnhanced = 'true';
        return;
      }
      const firstInfo = directInfoNodes.shift();
      if (firstInfo) {
        firstInfo.style.marginTop = '8px';
        firstInfo.style.fontWeight = '600';
      }
      const historyNodes = [];
      if (firstInfo) historyNodes.push(firstInfo);
      historyNodes.push(...directInfoNodes);
      const anchor = side.querySelector('details');
      const history = buildHistory(side, historyNodes);
      if (anchor) side.insertBefore(history, anchor);
      else side.appendChild(history);
      side.dataset.repricerUxHistoryEnhanced = 'true';
    });
  }

  let enhanceTimer = null;
  function enhance() {
    window.clearTimeout(enhanceTimer);
    enhanceTimer = window.setTimeout(() => {
      const root = document.getElementById('view-repricer');
      if (!root || !root.children.length) return;
      try {
        enhanceSettingsForm(root);
        enhanceHistory(root);
        normalizeBrandChips(root);
      } catch (error) {
        console.warn('[repricer-settings-ux] enhance failed', error);
      }
    }, 80);
  }

  function installObserver() {
    const root = document.getElementById('view-repricer');
    if (!root || root.dataset.repricerUxObserved === 'true') return;
    root.dataset.repricerUxObserved = 'true';
    const observer = new MutationObserver(() => enhance());
    observer.observe(root, { childList: true, subtree: true });
    enhance();
  }

  document.addEventListener('DOMContentLoaded', () => {
    installObserver();
    enhance();
  });

  window.addEventListener('load', () => {
    installObserver();
    enhance();
  });

  const originalRenderRepricer = window.renderRepricer;
  if (typeof originalRenderRepricer === 'function') {
    window.renderRepricer = function patchedRenderRepricer(...args) {
      const result = originalRenderRepricer.apply(this, args);
      enhance();
      return result;
    };
  }

  const originalRerenderCurrentView = window.rerenderCurrentView;
  if (typeof originalRerenderCurrentView === 'function') {
    window.rerenderCurrentView = function patchedRerenderCurrentView(...args) {
      const result = originalRerenderCurrentView.apply(this, args);
      enhance();
      return result;
    };
  }

  installObserver();
  enhance();
})();
