(function () {
  if (window.__ALTEA_REPRICER_SETTINGS_UX_HOTFIX_20260429C__) return;
  window.__ALTEA_REPRICER_SETTINGS_UX_HOTFIX_20260429C__ = true;

  const STORAGE_KEY = 'altea-repricer-ux-state-v1';
  const PORTAL_STORAGE_KEY = 'brand-portal-local-v1';
  const STYLE_ID = 'altea-repricer-settings-ux-style';
  const GUIDE_TEXT = {
    topActions: [
      ['Audit Excel', 'Выгружает полный аудит по всем SKU и площадкам для проверки. Ничего не меняет в портале и не отправляет цены на маркетплейс автоматически.'],
      ['WB загрузка', 'Готовит файл для ручной загрузки обычных цен в WB по финальным рекомендациям репрайсера.'],
      ['Ozon загрузка', 'Готовит файл для ручной загрузки обычных цен в Ozon по финальным рекомендациям репрайсера.'],
      ['WB promo загрузка', 'Готовит отдельный WB-шаблон только для акционных строк и промо-окон.'],
      ['Ozon promo загрузка', 'Готовит отдельный Ozon-шаблон только для акционных строк и промо-окон.']
    ],
    settingsActions: [
      ['Сохранить сейчас', 'Принудительно сохраняет общие настройки репрайсера немедленно. По сути это ручной дубль автосохранения.'],
      ['Сбросить к базовым', 'Удаляет ручные настройки контура и возвращает значения по умолчанию. Это влияет на весь контур, а не на одну SKU.']
    ],
    corridorActions: [
      ['Сохранить коридор', 'Запоминает ручные границы цены для конкретной SKU на конкретной площадке: floor, base, cap и promo floor.'],
      ['Сбросить коридор', 'Удаляет ручной коридор для этой SKU/площадки и возвращает расчёт к источникам модели.']
    ],
    overrideActions: [
      ['Сохранить override', 'Запоминает ручной режим и ручные цены для одной SKU на одной площадке. После сохранения этот override участвует в расчёте, пока вы его не снимете.'],
      ['Сбросить override', 'Полностью снимает ручной override и возвращает строку в автоматический режим модели.'],
      ['Принять предложение акции', 'Копирует предложение акции из фактов в обычный ручной override, чтобы его можно было сохранить, отредактировать и удержать как решение.']
    ],
    managementSteps: [
      ['Верхний блок — для массовых правил', 'Меняйте общие правила, бренды, статусы и роли только если правило должно влиять сразу на много SKU.'],
      ['Карточка SKU — для точечных решений', 'Если нужно управлять одной позицией, открывайте её карточку и работайте через corridor или override, а не через весь контур.'],
      ['Corridor задаёт рамки модели', 'Hard floor, base, cap и promo floor ограничивают, где репрайсер может принимать решение по этой SKU и площадке.'],
      ['Override фиксирует ручное решение', 'Override имеет приоритет над автоматикой, пока вы его не сбросите. Используйте его для ручных акций, фиксации цены или временной заморозки.'],
      ['Alignment работает не всегда', 'WB/Ozon alignment включается только когда глобально разрешён, разрешён брендом и статусом, не отключён override и SKU остаётся в режиме Auto.']
    ],
    metricGlossary: [
      ['Текущая', 'Фактическая цена на площадке сейчас по рабочему срезу.'],
      ['Финал', 'Итоговая цена, которую репрайсер рекомендует после floor/cap, alignment и промо-правил.'],
      ['floor / econ / cap', 'floor — нижняя защита, econ — экономический floor от себестоимости и fee stack, cap — верхняя граница обычной цены.'],
      ['pre / capped', 'pre — цена до alignment, capped — цена после применения ценового потолка и защитных ограничений.'],
      ['action / reason / align', 'action — что делает модель с ценой, reason — почему это произошло, align — итог alignment-сценария между WB и Ozon.']
    ]
  };
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

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.repricer-ux-guide{margin-top:12px;padding:14px 16px;border-radius:18px;border:1px solid rgba(214,175,85,.14);background:rgba(214,175,85,.05);display:grid;gap:10px;}',
      '.repricer-ux-guide summary{cursor:pointer;font-weight:700;color:#f4ead6;}',
      '.repricer-ux-guide-list{display:grid;gap:8px;margin-top:10px;}',
      '.repricer-ux-guide-item{padding:10px 12px;border-radius:14px;border:1px solid rgba(214,175,85,.12);background:rgba(9,7,5,.42);}',
      '.repricer-ux-inline-note{margin-top:8px;padding:10px 12px;border-radius:14px;border:1px solid rgba(214,175,85,.12);background:rgba(214,175,85,.04);}',
      '.repricer-ux-inline-note strong{display:block;margin-bottom:4px;color:#f4ead6;}',
      '.repricer-ux-field-note{line-height:1.4;color:#cdb58b;}'
    ].join('');
    document.head.appendChild(style);
  }

  function normalizedText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function setButtonTitle(button, text) {
    if (!(button instanceof HTMLElement) || !text) return;
    button.title = text;
    button.setAttribute('aria-label', text);
  }

  function buildGuide(sectionKey, title, intro, items, defaultOpen = false) {
    const details = document.createElement('details');
    details.className = 'repricer-ux-guide';
    details.dataset.repricerUxGuide = sectionKey;
    details.open = isOpen('sections', `guide:${sectionKey}`, defaultOpen);
    details.innerHTML = `<summary>${escapeHtml(title)}</summary>`;

    const body = document.createElement('div');
    body.className = 'repricer-ux-guide-list';
    if (intro) {
      const introNode = document.createElement('div');
      introNode.className = 'muted small';
      introNode.textContent = intro;
      body.appendChild(introNode);
    }
    items.forEach(([label, description]) => {
      const card = document.createElement('div');
      card.className = 'repricer-ux-guide-item';
      card.innerHTML = `<strong>${escapeHtml(label)}</strong><div class="muted small" style="margin-top:4px">${escapeHtml(description)}</div>`;
      body.appendChild(card);
    });
    details.appendChild(body);
    attachTogglePersistence(details, 'sections', `guide:${sectionKey}`);
    return details;
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
    if (name === 'hardFloor') return 'Hard floor, ₽';
    if (name === 'b2bFloor') return 'B2B floor, ₽';
    if (name === 'basePrice') return 'Base price, ₽';
    if (name === 'stretchCap') return 'Stretch cap, ₽';
    if (name === 'promoFloor') return 'Promo floor, ₽';
    if (name === 'elasticity') return 'Elasticity';
    if (name === 'floorPrice') return 'Manual floor, ₽';
    if (name === 'capPrice') return 'Manual cap, ₽';
    if (name === 'forcePrice') return 'Force price, ₽';
    if (name === 'promoPrice') return 'Promo price, ₽';
    if (name === 'promoLabel') return 'Акция / причина';
    if (name === 'promoFrom') return 'Promo from';
    if (name === 'promoTo') return 'Promo to';
    if (name === 'disableAlignment') return 'Отключить alignment';
    if (name === 'note') return 'Комментарий';
    if (name === 'alignmentEnabled') return inBrand ? 'Разрешить alignment' : 'Разрешить alignment WB/Ozon по score-модели';
    return String(input?.placeholder || '').trim() || 'Параметр';
  }

  function helpForField(input) {
    const name = String(input?.name || '').trim();
    const inStatus = Boolean(input.closest('[data-repricer-status-card]'));
    const inCorridor = Boolean(input.closest('.repricer-corridor-form'));
    const inOverride = Boolean(input.closest('.repricer-override-form'));
    const inBrand = Boolean(input.closest('[data-repricer-brand-card]'));

    if (name === 'minMarginPct') return 'Минимальная маржа, ниже которой модель не должна опускаться.';
    if (name === 'defaultTargetDays') return 'Целевая оборачиваемость для обычного Auto-режима. Ниже цели модель может повышать цену, выше — снижать.';
    if (name === 'launchTargetDays') return 'Отдельная цель оборачиваемости для новинок и перезапусков.';
    if (name === 'oosDays') return 'Если покрытие остатка падает ниже этого числа дней, включается low-stock/OOS-логика.';
    if (name === 'deadbandPct') return 'Минимальный процентный разрыв между WB и Ozon, чтобы вообще рассматривать alignment.';
    if (name === 'deadbandRub') return 'Минимальный разрыв в рублях для alignment между площадками.';
    if (name === 'mode') return inOverride
      ? 'Auto — вернуть модель; Hold — удерживать текущий контур; Freeze — не двигать автоматически; Force — держать ручную force price.'
      : 'Auto — обычный расчёт; Launch — мягкий режим новинки; Freeze — не двигать автоматически; Off — не давать рекомендацию.';
    if (name === 'allowAutoprice') return 'Разрешает автоматический расчёт для этого статуса.';
    if (name === 'allowLaunch') return 'Разрешает launch-логику для этого статуса.';
    if (name === 'allowAlignment') return 'Разрешает WB/Ozon alignment для этого статуса.';
    if (name === 'targetDays') return 'Целевая оборачиваемость для этой роли SKU.';
    if (name === 'minLiftPct') return 'Минимальный шаг изменения цены, чтобы репрайсер не дёргал цену из-за шума.';
    if (name === 'stretchMultiplier') return 'Насколько далеко модель может держаться выше базы, если рынок и коридор это позволяют.';
    if (name === 'elasticityDefault') return 'Чувствительность спроса к цене для score/alignment-модели.';
    if (name === 'allowVolumePush') return 'Если включено, модель может снижать цену ради ускорения оборота при перегреве.';
    if (name === 'commissionPct' || name === 'logisticsRub' || name === 'storageRub' || name === 'adRub' || name === 'returnsRub' || name === 'otherRub') {
      return 'Эти расходы участвуют в расчёте economic floor, если по SKU есть себестоимость.';
    }
    if (name === 'alignmentEnabled') return inBrand
      ? 'Разрешает или запрещает alignment для конкретного бренда.'
      : 'Включает межплощадочное выравнивание для всего контура. Ниже его ещё могут запретить бренд, статус или override.';
    if (inCorridor && name === 'hardFloor') return 'Жёсткий минимум цены для этой SKU и этой площадки.';
    if (inCorridor && name === 'b2bFloor') return 'Дополнительный floor для внутренних/B2B-ограничений, если нужен отдельно от market floor.';
    if (inCorridor && name === 'basePrice') return 'Опорная цена, от которой модель будет считать повышение или снижение.';
    if (inCorridor && name === 'stretchCap') return 'Верхняя граница обычной цены. Выше неё репрайсер не поднимет итог.';
    if (inCorridor && name === 'promoFloor') return 'Минимум для промо-цены, даже если акция предлагает поставить ниже.';
    if (inCorridor && name === 'elasticity') return 'Локальная эластичность этой SKU, если нужно переопределить роль.';
    if (inOverride && name === 'floorPrice') return 'Ручной минимум поверх модели для этой SKU и площадки.';
    if (inOverride && name === 'capPrice') return 'Ручной максимум поверх модели для этой SKU и площадки.';
    if (inOverride && name === 'forcePrice') return 'Цена, которую режим Force будет удерживать принудительно.';
    if (inOverride && name === 'promoPrice') return 'Цена только внутри выбранного промо-окна.';
    if (inOverride && name === 'promoLabel') return 'Короткое название акции или причина ручного решения.';
    if (inOverride && (name === 'promoFrom' || name === 'promoTo')) return 'Границы календарного промо-окна без привязки к часу.';
    if (inOverride && name === 'disableAlignment') return 'Запрещает выравнивание с другой площадкой именно для этой SKU.';
    if (inOverride && name === 'note') return 'Внутренний комментарий, зачем вы закрепили это ручное решение.';
    return '';
  }

  function ensureFieldLabel(input) {
    if (!(input instanceof HTMLElement)) return;
    const labelText = labelForField(input);
    const helpText = helpForField(input);
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
      if (helpText && !host.querySelector('[data-repricer-ux-field-note]')) {
        const note = document.createElement('span');
        note.className = 'muted small repricer-ux-field-note';
        note.dataset.repricerUxFieldNote = 'true';
        note.textContent = helpText;
        host.appendChild(note);
      }
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
    if (helpText) {
      const note = document.createElement('span');
      note.className = 'muted small repricer-ux-field-note';
      note.dataset.repricerUxFieldNote = 'true';
      note.textContent = helpText;
      field.appendChild(note);
    }
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
    form.appendChild(buildGuide(
      'repricer-playbook',
      'Как управлять репрайсером',
      'Короткая инструкция, когда менять общий контур, а когда работать точечно по одной SKU.',
      GUIDE_TEXT.managementSteps,
      true
    ));
    form.appendChild(buildGuide(
      'repricer-metric-glossary',
      'Что значат цифры в карточке SKU',
      'Это расшифровка основных цен и бейджей, которые видны справа в карточках WB/Ozon.',
      GUIDE_TEXT.metricGlossary,
      false
    ));

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

    form.appendChild(buildGuide(
      'settings-actions',
      'Что делают кнопки в настройках контура',
      'Верхний блок меняет общие правила расчёта репрайсера для всего контура. Это не настройки одной SKU.',
      GUIDE_TEXT.settingsActions,
      false
    ));

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

  function buildContextDetails(side, nodes) {
    const key = `context:${historyKey(side)}`;
    const details = document.createElement('details');
    details.dataset.repricerUxHistory = key;
    details.open = isOpen('history', key, false);
    details.style.marginTop = '8px';
    details.innerHTML = `
      <summary class="small muted" style="cursor:pointer">
        Почему такая цена сейчас
      </summary>
    `;

    const body = document.createElement('div');
    body.className = 'stack';
    body.style.marginTop = '10px';
    body.style.gap = '6px';

    const note = document.createElement('div');
    note.className = 'muted small';
    note.textContent = 'Этот блок только объясняет текущее решение репрайсера: стратегию, причину и контекст расчёта. Он ничего не сохраняет и не меняет.';
    body.appendChild(note);

    nodes.forEach((node, index) => {
      if (index === 0 && node?.style) node.style.fontWeight = '600';
      body.appendChild(node);
    });

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
      const history = buildContextDetails(side, historyNodes);
      if (anchor) side.insertBefore(history, anchor);
      else side.appendChild(history);
      side.dataset.repricerUxHistoryEnhanced = 'true';
    });
  }

  function enhanceNativeHistoryBlocks(root) {
    root.querySelectorAll('details[data-repricer-history]').forEach((details) => {
      if (details.dataset.repricerUxNativeHistory === 'true') return;
      details.dataset.repricerUxNativeHistory = 'true';
      const summary = details.querySelector('summary');
      if (summary) summary.textContent = 'История расчёта и источники';
      const body = details.querySelector('.stack');
      if (body && !body.querySelector('[data-repricer-ux-history-note]')) {
        const note = document.createElement('div');
        note.className = 'muted small';
        note.dataset.repricerUxHistoryNote = 'true';
        note.textContent = 'Здесь видны источники floor/base/cap, активное промо, alignment, guard-ограничения и дата свежести истории. Это объяснение расчёта, а не ручная настройка.';
        body.insertBefore(note, body.firstChild);
      }
    });
  }

  function enhanceTopActionGuide(root) {
    if (root.querySelector('[data-repricer-ux-guide="top-actions"]')) return;
    const sectionTitle = root.querySelector('.section-title');
    if (!sectionTitle) return;
    const guide = buildGuide(
      'top-actions',
      'Что делает каждая кнопка в репрайсере',
      'Важно: эти кнопки не отправляют цены в WB/Ozon автоматически. Они либо сохраняют настройки внутри портала, либо выгружают файл, который потом загружается вручную.',
      GUIDE_TEXT.topActions,
      false
    );
    sectionTitle.insertAdjacentElement('afterend', guide);
  }

  function enhancePlatformForms(root) {
    root.querySelectorAll('.repricer-corridor-form').forEach((form) => {
      if (form.dataset.repricerUxCorridor === 'true') return;
      form.dataset.repricerUxCorridor = 'true';
      const note = document.createElement('div');
      note.className = 'repricer-ux-inline-note';
      note.innerHTML = '<strong>Коридор цены</strong><div class="muted small">Коридор задаёт ручные границы модели для этой SKU на этой площадке: минимальную защиту, базу, верхнюю крышу и promo floor. Пока коридор сохранён, модель опирается на него.</div>';
      form.insertBefore(note, form.firstChild);

      const saveButton = Array.from(form.querySelectorAll('button')).find((button) => normalizedText(button.textContent) === 'Сохранить коридор');
      const resetButton = Array.from(form.querySelectorAll('button')).find((button) => normalizedText(button.textContent) === 'Сбросить коридор');
      setButtonTitle(saveButton, GUIDE_TEXT.corridorActions[0][1]);
      setButtonTitle(resetButton, GUIDE_TEXT.corridorActions[1][1]);
      form.querySelectorAll('input, select, textarea').forEach(ensureFieldLabel);
    });

    root.querySelectorAll('.repricer-override-form').forEach((form) => {
      if (form.dataset.repricerUxOverride === 'true') return;
      form.dataset.repricerUxOverride = 'true';
      const note = document.createElement('div');
      note.className = 'repricer-ux-inline-note';
      note.innerHTML = '<strong>Ручной override</strong><div class="muted small">Override действует только на одну SKU и одну площадку. Здесь можно зафиксировать режим, ручной floor/cap/force и окно акции. Пока override сохранён, он имеет приоритет над автоматическим решением модели.</div>';
      form.insertBefore(note, form.firstChild);

      const modeHelp = document.createElement('div');
      modeHelp.className = 'muted small';
      modeHelp.style.marginTop = '8px';
      modeHelp.textContent = 'Auto — вернуть модель; Hold — удерживать текущий контур; Freeze — не двигать автоматически; Force — принудительно держать цену force price.';
      const firstFilters = form.querySelector('.filters');
      if (firstFilters) firstFilters.insertAdjacentElement('afterend', modeHelp);

      Array.from(form.querySelectorAll('input[type="date"]')).forEach((input) => {
        input.title = 'Поле хранит обычную календарную дату без привязки к часу. Здесь можно выбирать и сегодняшнюю дату.';
      });

      const saveButton = Array.from(form.querySelectorAll('button')).find((button) => normalizedText(button.textContent) === 'Сохранить override');
      const resetButton = Array.from(form.querySelectorAll('button')).find((button) => normalizedText(button.textContent) === 'Сбросить override');
      const adoptButton = Array.from(form.querySelectorAll('button')).find((button) => normalizedText(button.textContent) === 'Принять предложение акции');
      setButtonTitle(saveButton, GUIDE_TEXT.overrideActions[0][1]);
      setButtonTitle(resetButton, GUIDE_TEXT.overrideActions[1][1]);
      setButtonTitle(adoptButton, GUIDE_TEXT.overrideActions[2][1]);

      form.querySelectorAll('input, select, textarea').forEach(ensureFieldLabel);
    });
  }

  function enhanceActionTitles(root) {
    GUIDE_TEXT.topActions.forEach(([label, description]) => {
      const button = Array.from(root.querySelectorAll('button')).find((node) => normalizedText(node.textContent) === label);
      setButtonTitle(button, description);
    });
    GUIDE_TEXT.settingsActions.forEach(([label, description]) => {
      const button = Array.from(root.querySelectorAll('button')).find((node) => normalizedText(node.textContent) === label);
      setButtonTitle(button, description);
    });
  }

  let enhanceTimer = null;
  function enhance() {
    window.clearTimeout(enhanceTimer);
    enhanceTimer = window.setTimeout(() => {
      const root = document.getElementById('view-repricer');
      if (!root || !root.children.length) return;
      try {
        ensureStyles();
        enhanceSettingsForm(root);
        enhanceHistory(root);
        enhanceNativeHistoryBlocks(root);
        enhanceTopActionGuide(root);
        enhancePlatformForms(root);
        enhanceActionTitles(root);
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
