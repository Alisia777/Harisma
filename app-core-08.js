function renderDocuments() {
  const root = document.getElementById('view-documents');
  const groups = state.documents?.groups || [];
  const filteredGroups = getDocumentGroupsFiltered();
  const totalDocs = groups.reduce((acc, group) => acc + (group.items || []).length, 0);
  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Р¦РµРЅС‚СЂ РґРѕРєСѓРјРµРЅС‚РѕРІ</h2>
        <p>РџРѕСЂС‚Р°Р» РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РїРѕСЂС‚Р°Р»РѕРј: РєР»СЋС‡РµРІС‹Рµ С„Р°Р№Р»С‹ РІС‹РЅРµСЃРµРЅС‹ РєРЅРѕРїРєР°РјРё, С‡С‚РѕР±С‹ РєРѕРјР°РЅРґР° РЅРµ РёСЃРєР°Р»Р° РёС… РїРѕ С‡Р°С‚Р°Рј Рё РїРѕС‡С‚Рµ.</p>
      </div>
      <div class="badge-stack">${badge(`${fmt.int(totalDocs)} С„Р°Р№Р»РѕРІ`, 'ok')}${badge('РєРЅРѕРїРєРё в†’ РґРѕРєСѓРјРµРЅС‚С‹', 'info')}</div>
    </div>

    <div class="banner">
      <div>рџ“Ћ</div>
      <div><strong>РЎРµР№С‡Р°СЃ РґРѕРєСѓРјРµРЅС‚С‹ Р»РµР¶Р°С‚ РїСЂСЏРјРѕ РІ РїР°РїРєРµ portal / library.</strong> Р”Р»СЏ Р±РѕРµРІРѕРіРѕ РїСѓР±Р»РёС‡РЅРѕРіРѕ РґРѕРјРµРЅР° Р»СѓС‡С€Рµ РїРµСЂРµРІРµСЃС‚Рё СЌС‚Рё СЃСЃС‹Р»РєРё РЅР° Google Drive / SharePoint СЃ РґРѕСЃС‚СѓРїРѕРј РїРѕ СЂРѕР»СЏРј, С‡С‚РѕР±С‹ РЅРµ РґРµР»Р°С‚СЊ СЂР°Р±РѕС‡РёРµ xlsx РїСѓР±Р»РёС‡РЅС‹РјРё.</div>
    </div>

    <div class="filters docs-filters">
      <input id="docSearchInput" placeholder="РџРѕРёСЃРє РїРѕ РЅР°Р·РІР°РЅРёСЋ РґРѕРєСѓРјРµРЅС‚Р°, РЅР°Р·РЅР°С‡РµРЅРёСЋ РёР»Рё С‚РёРїСѓвЂ¦" value="${escapeHtml(state.docFilters.search)}">
      <select id="docGroupFilter">
        <option value="all">Р’СЃРµ РіСЂСѓРїРїС‹</option>
        ${groups.map((group) => `<option value="${escapeHtml(group.title)}" ${state.docFilters.group === group.title ? 'selected' : ''}>${escapeHtml(group.title)}</option>`).join('')}
      </select>
    </div>

    <div class="doc-groups">
      ${filteredGroups.map((group) => `
        <div class="card">
          <div class="section-subhead">
            <div>
              <h3>${escapeHtml(group.title)}</h3>
              <p class="small muted">РљРЅРѕРїРєРё РѕС‚РєСЂС‹РІР°СЋС‚ Р»РѕРєР°Р»СЊРЅС‹Рµ demo-С„Р°Р№Р»С‹ РёР»Рё РјРѕРіСѓС‚ Р±С‹С‚СЊ Р·Р°РјРµРЅРµРЅС‹ РЅР° СЂР°Р±РѕС‡РёРµ СЃСЃС‹Р»РєРё.</p>
            </div>
            ${badge(`${fmt.int(group.items.length)} С€С‚.`)}
          </div>
          <div class="doc-grid">
            ${group.items.map((item) => `
              <a class="doc-card" href="${escapeHtml(item.href)}" target="_blank" rel="noopener">
                <div class="doc-top"><span class="doc-type">${escapeHtml(item.type)}</span><span class="muted small">${escapeHtml(String(item.sizeMb || '0'))} MB</span></div>
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.description || 'Р Р°Р±РѕС‡РёР№ С„Р°Р№Р»')}</p>
                <span class="doc-action">РћС‚РєСЂС‹С‚СЊ С„Р°Р№Р» в†’</span>
              </a>
            `).join('')}
          </div>
        </div>
      `).join('') || '<div class="empty">РќРёС‡РµРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ РїРѕ С„РёР»СЊС‚СЂР°Рј РґРѕРєСѓРјРµРЅС‚РѕРІ.</div>'}
    </div>
  `;

  document.getElementById('docSearchInput').addEventListener('input', (event) => {
    state.docFilters.search = event.target.value;
    renderDocuments();
  });
  document.getElementById('docGroupFilter').addEventListener('change', (event) => {
    state.docFilters.group = event.target.value;
    renderDocuments();
  });
}

function repricerClamp(value, min, max) {
  const numeric = numberOrZero(value);
  const floor = numberOrZero(min);
  const ceiling = Math.max(floor, numberOrZero(max));
  if (!ceiling) return Math.max(numeric, floor);
  return Math.min(Math.max(numeric, floor), ceiling);
}

function repricerFirstFilledNumber(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') return numberOrZero(value);
  }
  return 0;
}

function repricerCurrentDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function repricerPromoWindow(override) {
  const from = repricerDateKey(override?.promoFrom);
  const to = repricerDateKey(override?.promoTo);
  const today = repricerCurrentDateKey();
  if (!from && !to) return { from: '', to: '', status: 'always', active: true };
  if (from && to && from > to) return { from, to, status: 'invalid', active: false };
  if (from && today < from) return { from, to, status: 'scheduled', active: false };
  if (to && today > to) return { from, to, status: 'expired', active: false };
  return { from, to, status: 'active', active: true };
}

function repricerPromoWindowLabel(windowInfo, prefix = 'promo') {
  const status = String(windowInfo?.status || '');
  const normalizedPrefix = String(prefix || 'promo').trim() || 'promo';
  if (status === 'active') return `${normalizedPrefix} active`;
  if (status === 'scheduled') return `${normalizedPrefix} scheduled`;
  if (status === 'expired') return `${normalizedPrefix} expired`;
  if (status === 'invalid') return `${normalizedPrefix} dates`;
  if (status === 'paused') return `${normalizedPrefix} paused`;
  return `${normalizedPrefix} always`;
}

const REPRICER_PROMO_PRICE_ALIASES = [
  'promoOfferPrice',
  'promoSuggestedPrice',
  'promoTargetPrice',
  'promoPrice',
  'promo_price',
  'promo_offer_price',
  'promo_suggested_price',
  'promo_target_price',
  'actionPrice',
  'action_price',
  'salePrice',
  'sale_price',
  'discountPrice',
  'discount_price'
];

const REPRICER_PROMO_LABEL_ALIASES = [
  'promoLabel',
  'promoName',
  'promotionName',
  'promoReason',
  'promoComment',
  'promo_offer_label',
  'promo_offer_name',
  'actionLabel',
  'actionName',
  'saleLabel',
  'saleName'
];

const REPRICER_PROMO_FROM_ALIASES = [
  'promoFrom',
  'promoStart',
  'promoDateFrom',
  'promo_from',
  'promo_start',
  'promo_date_from',
  'offerFrom',
  'offerStart',
  'saleFrom',
  'saleStart',
  'promotionFrom',
  'promotionStart'
];

const REPRICER_PROMO_TO_ALIASES = [
  'promoTo',
  'promoEnd',
  'promoDateTo',
  'promo_to',
  'promo_end',
  'promo_date_to',
  'offerTo',
  'offerEnd',
  'saleTo',
  'saleEnd',
  'promotionTo',
  'promotionEnd'
];

const REPRICER_PROMO_ACTIVE_ALIASES = [
  'promoActive',
  'promoOfferActive',
  'promoEnabled',
  'promoSuggested',
  'hasPromoOffer',
  'offerActive',
  'actionActive',
  'saleActive',
  'promotionActive'
];

const REPRICER_PROMO_STATUS_ALIASES = [
  'promoStatus',
  'promoOfferStatus',
  'promotionStatus',
  'offerStatus',
  'actionStatus',
  'saleStatus'
];

function repricerAliasEntry(record, aliases) {
  if (!record || typeof record !== 'object') return { has: false, key: '', value: undefined };
  const lookup = new Map(Object.keys(record).map((key) => [String(key || '').trim().toLowerCase(), key]));
  for (const alias of aliases || []) {
    const normalizedAlias = String(alias || '').trim().toLowerCase();
    if (!normalizedAlias || !lookup.has(normalizedAlias)) continue;
    const actualKey = lookup.get(normalizedAlias);
    return { has: true, key: actualKey, value: record[actualKey] };
  }
  return { has: false, key: '', value: undefined };
}

function repricerAliasValue(record, aliases, options = {}) {
  const entry = repricerAliasEntry(record, aliases);
  if (!entry.has) return undefined;
  if (options.allowBlank) return entry.value;
  return repricerHasValue(entry.value) ? entry.value : undefined;
}

function repricerAliasPresent(record, aliases) {
  return repricerAliasEntry(record, aliases).has;
}

function repricerNormalizeBooleanFlag(value) {
  if (typeof value === 'boolean') return value;
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (['1', 'true', 'yes', 'y', 'on', 'active', 'enabled'].includes(raw)) return true;
  if (['0', 'false', 'no', 'n', 'off', 'inactive', 'disabled', 'paused'].includes(raw)) return false;
  return null;
}

function repricerPromoSourceLabel(source) {
  if (source === 'smart_price_workbench') return 'smart price workbench';
  if (source === 'price_workbench_support') return 'price workbench support';
  if (source === 'prices_snapshot') return 'prices snapshot';
  if (source === 'live_repricer') return 'live repricer';
  if (source === 'sku_fact') return 'sku facts';
  return 'promo offer';
}

function repricerResolvePromoOffer(candidates = []) {
  for (const candidate of candidates) {
    const row = candidate?.row;
    const priceEntry = repricerAliasEntry(row, REPRICER_PROMO_PRICE_ALIASES);
    const requestedPrice = numberOrZero(priceEntry.value);
    if (!priceEntry.has || requestedPrice <= 0) continue;
    const rawFrom = repricerAliasValue(row, REPRICER_PROMO_FROM_ALIASES, { allowBlank: true });
    const rawTo = repricerAliasValue(row, REPRICER_PROMO_TO_ALIASES, { allowBlank: true });
    const windowInfo = repricerPromoWindow({ promoFrom: rawFrom, promoTo: rawTo });
    const rawStatus = String(repricerAliasValue(row, REPRICER_PROMO_STATUS_ALIASES, { allowBlank: true }) || '').trim().toLowerCase();
    const activeFlag = repricerNormalizeBooleanFlag(repricerAliasValue(row, REPRICER_PROMO_ACTIVE_ALIASES, { allowBlank: true }));
    let windowStatus = windowInfo.status;
    let active = windowInfo.active;
    if (rawStatus.includes('sched')) {
      windowStatus = 'scheduled';
      active = false;
    } else if (rawStatus.includes('expir')) {
      windowStatus = 'expired';
      active = false;
    } else if (rawStatus.includes('invalid')) {
      windowStatus = 'invalid';
      active = false;
    } else if (rawStatus.includes('pause') || rawStatus.includes('disable') || rawStatus.includes('inactive') || rawStatus === 'off') {
      windowStatus = 'paused';
      active = false;
    } else if (rawStatus.includes('active') && windowStatus !== 'invalid') {
      windowStatus = rawFrom || rawTo ? 'active' : 'always';
      active = true;
    }
    if (activeFlag === false) {
      windowStatus = 'paused';
      active = false;
    } else if (activeFlag === true && windowStatus !== 'invalid') {
      windowStatus = rawFrom || rawTo ? 'active' : 'always';
      active = true;
    }
    return {
      configured: true,
      requestedPrice,
      label: String(repricerAliasValue(row, REPRICER_PROMO_LABEL_ALIASES, { allowBlank: true }) || '').trim(),
      from: repricerDateKey(rawFrom),
      to: repricerDateKey(rawTo),
      active,
      windowStatus,
      source: String(candidate?.source || '').trim() || 'promo_offer',
      sourceLabel: repricerPromoSourceLabel(candidate?.source),
      sourceField: priceEntry.key || ''
    };
  }
  return {
    configured: false,
    requestedPrice: 0,
    label: '',
    from: '',
    to: '',
    active: false,
    windowStatus: '',
    source: '',
    sourceLabel: '',
    sourceField: ''
  };
}

function repricerModeLabel(mode) {
  if (mode === 'launch') return 'Launch';
  if (mode === 'freeze') return 'Freeze';
  if (mode === 'hold') return 'Hold';
  if (mode === 'force') return 'Force';
  if (mode === 'off') return 'Off';
  return 'Auto';
}

function repricerModeTone(mode) {
  if (mode === 'force') return 'danger';
  if (mode === 'freeze') return 'warn';
  if (mode === 'hold') return 'info';
  if (mode === 'launch') return 'info';
  if (mode === 'off') return 'warn';
  return 'ok';
}

function repricerStatusRule(status, settings) {
  const normalized = String(status || '').trim();
  if (!normalized) return normalizeRepricerStatusRule({ mode: 'hold', allowAutoprice: false, allowLaunch: false, allowAlignment: false });
  const exact = settings?.statusRules?.[normalized];
  if (exact) return normalizeRepricerStatusRule(exact);
  const raw = normalized.toLowerCase();
  if (raw.includes('нов') || raw.includes('перезапуск')) return normalizeRepricerStatusRule({ mode: 'launch', allowAutoprice: true, allowLaunch: true, allowAlignment: false });
  if (raw.includes('вопрос') || raw.includes('перераб')) return normalizeRepricerStatusRule({ mode: 'freeze', allowAutoprice: false, allowLaunch: false, allowAlignment: false });
  if (raw.includes('вывод')) return normalizeRepricerStatusRule({ mode: 'off', allowAutoprice: false, allowLaunch: false, allowAlignment: false });
  return normalizeRepricerStatusRule({ mode: 'auto', allowAutoprice: true, allowLaunch: false, allowAlignment: true });
}

function repricerSuggestedRole(status, segment) {
  const statusRaw = String(status || '').toLowerCase();
  const segmentRaw = String(segment || '').toLowerCase();
  if (statusRaw.includes('нов') || statusRaw.includes('перезапуск')) return 'Launch';
  if (statusRaw.includes('вопрос') || statusRaw.includes('перераб')) return 'Freeze';
  if (statusRaw.includes('вывод')) return 'Exit';
  if (segmentRaw.includes('margin')) return 'Margin';
  if (segmentRaw.includes('traffic')) return 'Traffic';
  return 'Hero';
}

function repricerRoleRule(role, settings) {
  const exact = settings?.roleRules?.[String(role || '').trim()];
  if (exact) return normalizeRepricerRoleRule(exact);
  return normalizeRepricerRoleRule(defaultRepricerSettings().roleRules[repricerSuggestedRole('', role)] || defaultRepricerSettings().roleRules.Hero);
}

function repricerFeeRule(platform, settings) {
  const key = String(platform || '').trim().toLowerCase();
  const exact = settings?.feeRules?.[key];
  if (exact) return normalizeRepricerFeeRule(exact);
  return normalizeRepricerFeeRule(defaultRepricerSettings().feeRules[key] || defaultRepricerSettings().feeRules.wb);
}

function repricerBrandRule(brand, settings) {
  const raw = String(brand || '').trim();
  const defaults = defaultRepricerSettings();
  const exact = settings?.brandRules?.[raw];
  if (exact) return normalizeRepricerBrandRule(exact, defaults.brandRules?.[raw] || defaults.global);
  const lower = raw.toLowerCase();
  const matchedKey = Object.keys(settings?.brandRules || {}).find((key) => String(key || '').trim().toLowerCase() === lower)
    || Object.keys(defaults.brandRules || {}).find((key) => String(key || '').trim().toLowerCase() === lower);
  if (matchedKey) return normalizeRepricerBrandRule(settings?.brandRules?.[matchedKey], defaults.brandRules?.[matchedKey] || defaults.global);
  return normalizeRepricerBrandRule({}, defaults.global);
}

function repricerDefaultLaunchReady(status) {
  const raw = String(status || '').toLowerCase();
  if (raw.includes('нов') || raw.includes('перезапуск')) return 'HOLD';
  return 'READY';
}

function repricerFindSkuProfile(articleKey) {
  const pool = state.storage?.repricerSkuProfiles || [];
  return pool.find((item) => item.articleKey === articleKey) || null;
}

function repricerHasSkuProfile(profile) {
  if (!profile) return false;
  return Boolean(String(profile.status || '').trim() || String(profile.role || '').trim() || String(profile.launchReady || '').trim());
}

function repricerFindCorridor(articleKey, platform) {
  const pool = state.storage?.repricerCorridors || [];
  return pool.find((item) => item.articleKey === articleKey && item.platform === platform)
    || pool.find((item) => item.articleKey === articleKey && item.platform === 'all')
    || null;
}

function repricerHasCorridor(corridor) {
  if (!corridor) return false;
  return corridor.hardFloor !== ''
    || corridor.b2bFloor !== ''
    || corridor.basePrice !== ''
    || corridor.stretchCap !== ''
    || corridor.promoFloor !== ''
    || corridor.elasticity !== '';
}

function repricerFindOverride(articleKey, platform) {
  const pool = state.storage?.repricerOverrides || [];
  return pool.find((item) => item.articleKey === articleKey && item.platform === platform)
    || pool.find((item) => item.articleKey === articleKey && item.platform === 'all')
    || null;
}

function repricerNormalizeArticleKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-zа-я0-9]+/gi, '');
}

function repricerLiveMap() {
  const rows = Array.isArray(state.repricerLive?.rows) ? state.repricerLive.rows : [];
  const map = new Map();
  rows.forEach((row) => {
    const key = repricerNormalizeArticleKey(row?.articleKey || row?.article);
    if (key && !map.has(key)) map.set(key, row);
  });
  return map;
}

function repricerSkuFactMap() {
  const rows = Array.isArray(state.skus) ? state.skus : [];
  const map = new Map();
  rows.forEach((row) => {
    [
      row?.articleKey,
      row?.article,
      row?.sku
    ].map((value) => repricerNormalizeArticleKey(value)).forEach((key) => {
      if (key && !map.has(key)) map.set(key, row);
    });
  });
  return map;
}

function repricerSupportMap(platform) {
  const rows = state.priceWorkbenchSupport?.platforms?.[platform]?.rows;
  const map = new Map();
  if (!rows) return map;
  if (Array.isArray(rows)) {
    rows.forEach((row) => {
      const key = repricerNormalizeArticleKey(row?.articleKey || row?.article);
      if (key && !map.has(key)) map.set(key, row);
    });
    return map;
  }
  if (typeof rows === 'object') {
    Object.entries(rows).forEach(([rawKey, row]) => {
      const key = repricerNormalizeArticleKey(row?.articleKey || row?.article || rawKey);
      if (key && !map.has(key)) map.set(key, row);
    });
  }
  return map;
}

function repricerPricesMap(platform) {
  const rows = Array.isArray(state.prices?.platforms?.[platform]?.rows) ? state.prices.platforms[platform].rows : [];
  const map = new Map();
  rows.forEach((row) => {
    const key = repricerNormalizeArticleKey(row?.articleKey || row?.article);
    if (key && !map.has(key)) map.set(key, row);
  });
  return map;
}

function repricerHasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function repricerModeCode(mode) {
  const raw = String(mode || '').trim().toLowerCase();
  if (raw === 'launch') return 'LAUNCH';
  if (raw === 'freeze') return 'FREEZE';
  if (raw === 'hold') return 'HOLD';
  if (raw === 'force') return 'FORCE';
  if (raw === 'off') return 'OFF';
  return 'AUTO';
}

function repricerRecentUnits7d(sourceRow) {
  const direct = repricerFirstFilledNumber(sourceRow?.sales7d, sourceRow?.sales_7d, sourceRow?.orders7d, sourceRow?.orders_7d);
  if (direct > 0) return direct;
  const timeline = Array.isArray(sourceRow?.monthly) ? sourceRow.monthly : (Array.isArray(sourceRow?.daily) ? sourceRow.daily : []);
  const recent = timeline.filter(Boolean).slice(-7);
  const delivered = recent.reduce((sum, item) => sum + numberOrZero(item?.deliveredUnits), 0);
  if (delivered > 0) return delivered;
  const ordered = recent.reduce((sum, item) => sum + numberOrZero(item?.ordersUnits), 0);
  return ordered > 0 ? ordered : 0;
}

function repricerProjectedUnits(keepUnits, currentBuyerPrice, nextBuyerPrice, elasticity) {
  const baseUnits = numberOrZero(keepUnits);
  const currentBuyer = numberOrZero(currentBuyerPrice);
  const nextBuyer = numberOrZero(nextBuyerPrice);
  const elasticityValue = Number.isFinite(Number(elasticity)) ? Number(elasticity) : -1;
  if (baseUnits <= 0 || currentBuyer <= 0 || nextBuyer <= 0) return baseUnits;
  return Math.max(0, baseUnits * ((nextBuyer / currentBuyer) ** elasticityValue));
}

function repricerMarginAtPrice(price, discountFactor, commissionPct, logisticsRub, storageRub, adRub, costRub) {
  const fillPrice = numberOrZero(price);
  if (fillPrice <= 0) return 0;
  return fillPrice * numberOrZero(discountFactor) * (1 - numberOrZero(commissionPct))
    - numberOrZero(logisticsRub)
    - numberOrZero(storageRub)
    - numberOrZero(adRub)
    - numberOrZero(costRub);
}

function repricerHasOverride(override) {
  if (!override) return false;
  return override.mode !== 'auto'
    || override.floorPrice !== ''
    || override.capPrice !== ''
    || override.forcePrice !== ''
    || Boolean(override.promoActive)
    || override.promoPrice !== ''
    || Boolean(String(override.promoLabel || '').trim())
    || Boolean(String(override.promoFrom || '').trim())
    || Boolean(String(override.promoTo || '').trim())
    || override.disableAlignment
    || Boolean(String(override.note || '').trim());
}

function repricerSourceSummary(candidates, target, fallback = '') {
  const winner = numberOrZero(target);
  if (winner <= 0) return fallback;
  const labels = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => {
      const value = numberOrZero(candidate?.value);
      return value > 0 && Math.abs(value - winner) <= 0.001;
    })
    .map((candidate) => String(candidate?.label || '').trim())
    .filter(Boolean);
  return labels.length ? labels.join(' + ') : fallback;
}

function repricerProtectRecommendedPrice(side, notePrefix = '') {
  if (!side || side.criticalGate === 'SKIP') return side;
  const floor = Math.max(
    numberOrZero(side.effectiveFloor),
    numberOrZero(side.hardFloor),
    numberOrZero(side.b2bFloor),
    numberOrZero(side.economicFloor),
    numberOrZero(side.skuMinPrice),
    numberOrZero(side.override?.floorPrice)
  );
  const cap = numberOrZero(side.capPrice) > 0 ? Math.max(numberOrZero(side.capPrice), floor) : 0;
  let nextPrice = numberOrZero(side.recommendedPrice);
  const notes = [];
  if (floor > 0 && nextPrice + 0.001 < floor) {
    nextPrice = floor;
    side.floorGuardApplied = true;
    notes.push(`floor guard ${fmt.money(floor)}`);
  } else {
    side.floorGuardApplied = false;
  }
  if (cap > 0 && nextPrice - 0.001 > cap) {
    nextPrice = cap;
    side.capGuardApplied = true;
    notes.push(`cap guard ${fmt.money(cap)}`);
  } else {
    side.capGuardApplied = false;
  }
  side.finalGuardFloor = floor;
  side.finalGuardCap = cap;
  side.recommendedPrice = nextPrice;
  if (notes.length) {
    const prefix = String(notePrefix || '').trim();
    const renderedNotes = prefix ? notes.map((note) => `${prefix} ${note}`) : notes;
    side.reason = [side.reason, ...renderedNotes].filter(Boolean).join(' · ');
  }
  return side;
}

function repricerFinalizeSide(side) {
  if (!side) return null;
  side.recommendedPrice = Math.round(numberOrZero(side.recommendedPrice));
  side.finalPrice = side.recommendedPrice;
  side.changeRub = numberOrZero(side.recommendedPrice) - numberOrZero(side.currentPrice);
  side.changePct = numberOrZero(side.currentPrice) > 0 ? side.changeRub / numberOrZero(side.currentPrice) : null;
  side.changed = Math.abs(side.changeRub) >= 1;
  side.belowFloorNow = numberOrZero(side.currentPrice) > 0 && numberOrZero(side.effectiveFloor) > 0 && numberOrZero(side.currentPrice) + 0.001 < numberOrZero(side.effectiveFloor);
  side.marginRisk = side.marginPct != null && side.requiredMarginPct != null && numberOrZero(side.marginPct) + 0.0001 < numberOrZero(side.requiredMarginPct);
  side.lowStockRisk = numberOrZero(side.turnoverDays) > 0 && numberOrZero(side.turnoverDays) <= numberOrZero(side.oosDays);
  side.hasLiveBenchmark = numberOrZero(side.liveReferencePrice) > 0;
  side.liveDeltaRub = side.hasLiveBenchmark ? numberOrZero(side.finalPrice) - numberOrZero(side.liveReferencePrice) : null;
  side.liveDeltaPct = side.hasLiveBenchmark && numberOrZero(side.liveReferencePrice) > 0
    ? side.liveDeltaRub / numberOrZero(side.liveReferencePrice)
    : null;
  side.liveDrift = side.liveDeltaPct != null && Math.abs(side.liveDeltaPct) >= 0.03;
  return side;
}

function buildRepricerSide(sourceRow, platform, settings, context = {}) {
  if (!sourceRow) return null;
  const articleKey = sourceRow.articleKey || sourceRow.article || '';
  const override = repricerFindOverride(articleKey, platform);
  const corridor = repricerFindCorridor(articleKey, platform);
  const liveRow = context.liveRow && typeof context.liveRow === 'object' ? context.liveRow : null;
  const liveSide = liveRow && liveRow[platform] && typeof liveRow[platform] === 'object' ? liveRow[platform] : null;
  const skuFact = context.skuFact && typeof context.skuFact === 'object' ? context.skuFact : null;
  const skuSide = skuFact && skuFact[platform] && typeof skuFact[platform] === 'object' ? skuFact[platform] : null;
  const supportRow = context.supportRow && typeof context.supportRow === 'object' ? context.supportRow : null;
  const priceRow = context.priceRow && typeof context.priceRow === 'object' ? context.priceRow : null;
  const supportPricingPresent = [
    supportRow?.currentExportPrice,
    supportRow?.requiredPriceForProfitability,
    supportRow?.hardMinPrice,
    supportRow?.historicalMinProfitablePrice,
    supportRow?.minPrice,
    supportRow?.workingZoneFrom,
    supportRow?.workingZoneTo,
    supportRow?.maxPrice
  ].some(repricerHasValue);
  const priceSnapshotPresent = [
    priceRow?.currentPrice,
    priceRow?.minPrice,
    priceRow?.basePrice
  ].some(repricerHasValue);
  const brand = context.brand || sourceRow.brand || skuFact?.brand || '';
  const status = context.status || sourceRow.status || '';
  const sourceMode = String(sourceRow.sourceMode || '').trim();
  const clientOnlyMarketFacts = sourceMode === 'wb-market-facts-client-only';
  const role = context.role || repricerSuggestedRole(status, sourceRow.segment);
  const launchReady = normalizeRepricerLaunchReady(context.launchReady || repricerDefaultLaunchReady(status));
  const brandRule = repricerBrandRule(brand, settings);
  const statusRule = repricerStatusRule(status, settings);
  const roleRule = repricerRoleRule(role, settings);
  const feeRule = repricerFeeRule(platform, settings);
  const skuMinPrice = numberOrZero(skuSide?.minPrice);
  const skuBasePrice = repricerFirstFilledNumber(skuSide?.basePrice, skuSide?.recPrice);
  const skuCapPrice = repricerFirstFilledNumber(skuSide?.maxPrice, skuSide?.stretchCap);
  const sourceHasLiveCurrentPrice = String(sourceRow.currentSellerPriceSource || sourceRow.currentPriceSource || '').trim().toLowerCase() === 'live';
  const currentPricePresent = [sourceRow.currentFillPrice, sourceRow.currentPrice, priceRow?.currentPrice, supportRow?.currentExportPrice, skuSide?.currentPrice, liveSide?.currentPrice].some(repricerHasValue);
  const hardFloorPresent = [
    sourceRow.hardMinPrice,
    sourceRow.requiredPriceForProfitability,
    sourceRow.minPrice,
    sourceRow.workingZoneFrom,
    supportRow?.hardMinPrice,
    supportRow?.requiredPriceForProfitability,
    supportRow?.historicalMinProfitablePrice,
    supportRow?.minPrice,
    supportRow?.workingZoneFrom,
    corridor?.hardFloor,
    skuSide?.minPrice,
    priceRow?.minPrice,
    liveSide?.minPrice
  ].some(repricerHasValue);
  const costPresent = [sourceRow.cost, sourceRow.costRub, liveRow?.cost, skuFact?.costPrice].some(repricerHasValue);
  const currentPrice = numberOrZero(
    sourceHasLiveCurrentPrice && sourceRow.currentFillPrice != null
      ? sourceRow.currentFillPrice
      : (sourceHasLiveCurrentPrice && sourceRow.currentPrice != null
        ? sourceRow.currentPrice
        : (priceRow?.currentPrice != null
          ? priceRow.currentPrice
          : (sourceRow.currentFillPrice != null
            ? sourceRow.currentFillPrice
            : (sourceRow.currentPrice != null
              ? sourceRow.currentPrice
              : (supportRow?.currentExportPrice != null
                ? supportRow.currentExportPrice
                : (skuSide?.currentPrice != null ? skuSide.currentPrice : liveSide?.currentPrice))))))
  );
  const currentClientPrice = repricerFirstFilledNumber(
    priceRow?.currentClientPrice,
    clientOnlyMarketFacts ? null : sourceRow.currentClientPrice,
    clientOnlyMarketFacts ? null : sourceRow.buyerPrice,
    supportRow?.buyerCurrentExportMinPrice,
    skuSide?.buyerPrice,
    liveSide?.buyerPrice
  );
  const seedTargetSource = sourceRow.seedTargetFillPrice != null
    ? 'smart_seed'
    : (sourceRow.basePrice != null
      ? 'smart_base'
      : (priceRow?.basePrice != null
        ? 'price_snapshot_base'
        : (skuBasePrice > 0
          ? 'sku_base'
          : (supportRow?.workingZoneFrom != null
            ? 'support_floor'
            : (liveSide?.basePrice != null
              ? 'live_base'
              : (liveSide?.recPrice != null ? 'live_rec' : (currentPrice > 0 ? 'current_price' : '')))))));
  const seedTargetPrice = numberOrZero(
    sourceRow.seedTargetFillPrice != null
      ? sourceRow.seedTargetFillPrice
      : (sourceRow.basePrice != null
        ? sourceRow.basePrice
        : (priceRow?.basePrice != null
          ? priceRow.basePrice
          : (skuBasePrice > 0
            ? skuBasePrice
            : (supportRow?.workingZoneFrom != null
              ? supportRow.workingZoneFrom
              : (liveSide?.basePrice != null
                ? liveSide.basePrice
                : (liveSide?.recPrice != null ? liveSide.recPrice : currentPrice))))))
  );
  const managedBasePrice = repricerFirstFilledNumber(corridor?.basePrice, skuBasePrice, seedTargetPrice, currentPrice);
  const sourceFloorCandidate = Math.max(
    numberOrZero(sourceRow.hardMinPrice),
    numberOrZero(sourceRow.requiredPriceForProfitability),
    numberOrZero(sourceRow.minPrice)
  );
  const supportFloorCandidate = Math.max(
    numberOrZero(supportRow?.hardMinPrice),
    numberOrZero(supportRow?.historicalMinProfitablePrice),
    numberOrZero(supportRow?.requiredPriceForProfitability),
    numberOrZero(supportRow?.minPrice)
  );
  const hardFloorCandidates = [
    { label: 'corridor_hard_floor', value: numberOrZero(corridor?.hardFloor) },
    { label: 'market_floor', value: sourceFloorCandidate },
    { label: 'support_floor', value: supportFloorCandidate },
    { label: 'price_snapshot_min', value: numberOrZero(priceRow?.minPrice) },
    { label: 'sku_min', value: skuMinPrice },
    { label: 'live_min', value: numberOrZero(liveSide?.minPrice) }
  ];
  const sourceHardFloor = Math.max(sourceFloorCandidate, supportFloorCandidate, numberOrZero(priceRow?.minPrice), skuMinPrice, numberOrZero(liveSide?.minPrice));
  const hardFloor = Math.max(sourceHardFloor, numberOrZero(corridor?.hardFloor));
  const hardFloorSourceSummary = repricerSourceSummary(hardFloorCandidates, hardFloor, hardFloor > 0 ? 'hard_floor' : '');
  const b2bFloor = numberOrZero(corridor?.b2bFloor);
  const costRub = Math.max(numberOrZero(sourceRow.cost), numberOrZero(sourceRow.costRub), numberOrZero(liveRow?.cost), numberOrZero(skuFact?.costPrice));
  const liveMinMarginPct = numberOrZero(liveSide?.marginNoAdsMinPct);
  const baseAllowedMarginPct = Math.max(numberOrZero(sourceRow.allowedMarginPct), numberOrZero(supportRow?.allowedMarginPct), numberOrZero(priceRow?.allowedMarginPct), liveMinMarginPct, 0.0001);
  const requiredMarginPct = Math.max(numberOrZero(brandRule.minMarginPct) / 100, numberOrZero(sourceRow.allowedMarginPct), numberOrZero(supportRow?.allowedMarginPct), numberOrZero(priceRow?.allowedMarginPct), liveMinMarginPct);
  const economicMarginFloor = numberOrZero(sourceRow.requiredPriceForMargin) > 0
    ? numberOrZero(sourceRow.requiredPriceForMargin) * (requiredMarginPct / baseAllowedMarginPct)
    : 0;
  const commissionPct = numberOrZero(feeRule.commissionPct) / 100;
  const feeStackRub = numberOrZero(feeRule.logisticsRub) + numberOrZero(feeRule.storageRub) + numberOrZero(feeRule.adRub) + numberOrZero(feeRule.returnsRub) + numberOrZero(feeRule.otherRub);
  const economicFloorByFee = costRub > 0 && (1 - commissionPct - requiredMarginPct) > 0
    ? Math.ceil((costRub + feeStackRub) / (1 - commissionPct - requiredMarginPct))
    : 0;
  const economicFloorFallback = Math.max(
    numberOrZero(sourceRow.requiredPriceForProfitability),
    numberOrZero(sourceRow.minPrice),
    numberOrZero(sourceRow.workingZoneFrom),
    numberOrZero(supportRow?.requiredPriceForProfitability),
    numberOrZero(supportRow?.hardMinPrice),
    numberOrZero(supportRow?.historicalMinProfitablePrice),
    numberOrZero(supportRow?.minPrice),
    numberOrZero(supportRow?.workingZoneFrom),
    numberOrZero(priceRow?.minPrice),
    economicMarginFloor,
    skuMinPrice,
    numberOrZero(liveSide?.minPrice)
  );
  const economicFloor = Math.max(economicFloorByFee, economicFloorFallback);
  const economicFloorSource = economicFloorByFee > 0
    ? (economicFloorByFee >= economicFloorFallback ? 'fee_stack' : 'snapshot_guard')
    : 'snapshot_fallback';
  const economicFloorSourceLabel = economicFloorSource === 'fee_stack'
    ? 'economic_fee_stack'
    : (economicFloorSource === 'snapshot_guard' ? 'economic_snapshot_guard' : 'economic_snapshot_fallback');
  const effectiveFloor = Math.max(hardFloor, b2bFloor, economicFloor, numberOrZero(override?.floorPrice));
  const manualPromoRequestedPrice = numberOrZero(override?.promoPrice);
  const manualPromoWindow = repricerPromoWindow(override);
  const manualPromoConfigured = Boolean(override?.promoActive) && manualPromoRequestedPrice > 0;
  const manualPromoActive = manualPromoConfigured && manualPromoWindow.active;
  const manualPromoLabel = String(override?.promoLabel || '').trim();
  const effectiveFloorCandidates = [
    { label: hardFloorSourceSummary || 'hard_floor', value: hardFloor },
    { label: 'b2b_floor', value: b2bFloor },
    { label: economicFloorSourceLabel, value: economicFloor },
    { label: 'override_floor', value: numberOrZero(override?.floorPrice) }
  ];
  const effectiveFloorSourceSummary = repricerSourceSummary(effectiveFloorCandidates, effectiveFloor, effectiveFloor > 0 ? economicFloorSourceLabel : '');
  const promoFloor = Math.max(numberOrZero(corridor?.promoFloor), effectiveFloor);
  const promoFloorSourceSummary = repricerSourceSummary([
    { label: 'corridor_promo_floor', value: numberOrZero(corridor?.promoFloor) },
    { label: effectiveFloorSourceSummary || 'effective_floor', value: effectiveFloor }
  ], promoFloor, promoFloor > 0 ? 'promo_floor_guard' : '');
  const manualPromoResolvedPrice = manualPromoConfigured ? Math.max(manualPromoRequestedPrice, promoFloor) : 0;
  const manualPromoAdjustedToFloor = manualPromoConfigured && manualPromoRequestedPrice + 0.001 < promoFloor;
  const promoOffer = repricerResolvePromoOffer([
    { source: 'smart_price_workbench', row: sourceRow },
    { source: 'price_workbench_support', row: supportRow },
    { source: 'prices_snapshot', row: priceRow },
    { source: 'live_repricer', row: liveSide },
    { source: 'sku_fact', row: skuSide }
  ]);
  const promoOfferConfigured = Boolean(promoOffer.configured) && promoOffer.requestedPrice > 0;
  const promoOfferRequestedPrice = numberOrZero(promoOffer.requestedPrice);
  const promoOfferResolvedPrice = promoOfferConfigured ? Math.max(promoOfferRequestedPrice, promoFloor) : 0;
  const promoOfferAdjustedToFloor = promoOfferConfigured && promoOfferRequestedPrice + 0.001 < promoFloor;
  const promoOfferActive = promoOfferConfigured && Boolean(promoOffer.active);
  const preferredPromo = manualPromoActive
    ? {
      source: 'manual_override',
      sourceLabel: 'manual override',
      requestedPrice: manualPromoRequestedPrice,
      price: manualPromoResolvedPrice,
      label: manualPromoLabel,
      from: manualPromoWindow.from,
      to: manualPromoWindow.to,
      windowStatus: manualPromoWindow.status,
      adjustedToFloor: manualPromoAdjustedToFloor
    }
    : (promoOfferActive
      ? {
        source: 'promo_offer',
        sourceLabel: promoOffer.sourceLabel || 'promo offer',
        requestedPrice: promoOfferRequestedPrice,
        price: promoOfferResolvedPrice,
        label: promoOffer.label,
        from: promoOffer.from,
        to: promoOffer.to,
        windowStatus: promoOffer.windowStatus,
        adjustedToFloor: promoOfferAdjustedToFloor
      }
      : (manualPromoConfigured
        ? {
          source: 'manual_override',
          sourceLabel: 'manual override',
          requestedPrice: manualPromoRequestedPrice,
          price: manualPromoResolvedPrice,
          label: manualPromoLabel,
          from: manualPromoWindow.from,
          to: manualPromoWindow.to,
          windowStatus: manualPromoWindow.status,
          adjustedToFloor: manualPromoAdjustedToFloor
        }
        : (promoOfferConfigured
          ? {
            source: 'promo_offer',
            sourceLabel: promoOffer.sourceLabel || 'promo offer',
            requestedPrice: promoOfferRequestedPrice,
            price: promoOfferResolvedPrice,
            label: promoOffer.label,
            from: promoOffer.from,
            to: promoOffer.to,
            windowStatus: promoOffer.windowStatus,
            adjustedToFloor: promoOfferAdjustedToFloor
          }
          : null)));
  const promoConfigured = Boolean(manualPromoConfigured || promoOfferConfigured);
  const promoActive = Boolean(manualPromoActive || (!manualPromoActive && promoOfferActive));
  const promoRequestedPrice = numberOrZero(preferredPromo?.requestedPrice);
  const promoWindow = preferredPromo
    ? {
      from: preferredPromo.from,
      to: preferredPromo.to,
      status: preferredPromo.windowStatus,
      active: promoActive
    }
    : { from: '', to: '', status: '', active: false };
  const promoLabel = String(preferredPromo?.label || '').trim();
  const promoSource = String(preferredPromo?.source || '').trim();
  const promoSourceLabel = String(preferredPromo?.sourceLabel || '').trim();
  const promoPrice = promoActive ? numberOrZero(preferredPromo?.price) : 0;
  const promoAdjustedToFloor = promoActive && Boolean(preferredPromo?.adjustedToFloor);
  const zoneFrom = Math.max(numberOrZero(sourceRow.workingZoneFrom), numberOrZero(corridor?.promoFloor), effectiveFloor);
  const stretchMultiplier = Math.max(1, numberOrZero(roleRule.stretchMultiplier) || 1);
  const derivedStretchCap = managedBasePrice > 0 ? Math.round(Math.max(managedBasePrice, managedBasePrice * stretchMultiplier)) : 0;
  const stretchCap = repricerFirstFilledNumber(corridor?.stretchCap, skuCapPrice, sourceRow.workingZoneTo, supportRow?.workingZoneTo, supportRow?.maxPrice, derivedStretchCap);
  const manualCapPrice = numberOrZero(override?.capPrice);
  const capPrice = manualCapPrice > 0
    ? (stretchCap > 0 ? Math.min(manualCapPrice, stretchCap) : manualCapPrice)
    : Math.max(stretchCap, 0);
  const managedBaseSourceSummary = numberOrZero(corridor?.basePrice) > 0
    ? 'corridor_base'
    : (skuBasePrice > 0
      ? 'sku_base'
      : (seedTargetPrice > 0
        ? (seedTargetSource || 'seed_target')
        : (currentPrice > 0 ? 'current_price' : '')));
  const stretchCapSourceSummary = numberOrZero(corridor?.stretchCap) > 0
    ? 'corridor_cap'
    : (skuCapPrice > 0
      ? 'sku_cap'
      : (numberOrZero(sourceRow.workingZoneTo) > 0
        ? 'market_cap'
        : (numberOrZero(supportRow?.workingZoneTo) > 0
          ? 'support_zone_cap'
          : (numberOrZero(supportRow?.maxPrice) > 0 ? 'support_max_cap' : (derivedStretchCap > 0 ? 'role_derived_cap' : '')))));
  const capSourceSummary = repricerSourceSummary([
    { label: 'override_cap', value: manualCapPrice },
    { label: stretchCapSourceSummary || 'stretch_cap', value: stretchCap }
  ], capPrice, capPrice > 0 ? (stretchCapSourceSummary || 'cap') : '');
  const engineMode = statusRule.mode;
  const mode = override?.mode && override.mode !== 'auto' ? override.mode : engineMode;
  const engineModeCode = repricerModeCode(engineMode);
  const modeCode = repricerModeCode(mode);
  const autopriceAllowed = Boolean(statusRule.allowAutoprice);
  const launchAllowed = Boolean(statusRule.allowLaunch);
  const volumePushAllowed = Boolean(roleRule.allowVolumePush);
  const targetDays = Math.max(1, numberOrZero(skuSide?.targetTurnoverDays) || numberOrZero(sourceRow.targetTurnoverDays) || numberOrZero(liveSide?.targetTurnoverDays) || numberOrZero(roleRule.targetDays) || (engineMode === 'launch'
    ? numberOrZero(brandRule.launchTargetDays)
    : numberOrZero(brandRule.defaultTargetDays)));
  const oosDays = numberOrZero(brandRule.oosDays);
  const stock = repricerFirstFilledNumber(
    sourceRow.stockRepricer,
    sourceRow.stock,
    skuSide?.stockRepricer,
    skuSide?.stockProducts,
    skuSide?.stock,
    liveSide?.stock
  );
  const ordersDaily = numberOrZero(skuFact?.orders?.units) / 27;
  const inboundUnits = numberOrZero(skuSide?.stockInTransit) + numberOrZero(skuSide?.stockInSupplyRequest);
  const leadTimeDays = numberOrZero(skuFact?.leadTimeDays);
  let turnoverSource = sourceRow.turnoverCurrentDays != null
    ? 'workbench'
    : (skuSide?.turnoverDays != null ? 'order' : (liveSide?.turnoverDays != null ? 'live' : ''));
  let turnoverDays = numberOrZero(
    sourceRow.turnoverCurrentDays != null
      ? sourceRow.turnoverCurrentDays
      : (skuSide?.turnoverDays != null ? skuSide.turnoverDays : liveSide?.turnoverDays)
  );
  if (turnoverDays <= 0 && stock > 0 && ordersDaily > 0) {
    turnoverDays = stock / ordersDaily;
    turnoverSource = 'derived_orders';
  }
  const sales7d = Math.max(repricerRecentUnits7d(sourceRow), ordersDaily * 7);
  const commissionPctValue = repricerHasValue(sourceRow.commissionPct) ? numberOrZero(sourceRow.commissionPct) : numberOrZero(feeRule.commissionPct) / 100;
  const logisticsRubValue = repricerFirstFilledNumber(sourceRow.logisticsRub, feeRule.logisticsRub);
  const storageRubValue = repricerFirstFilledNumber(sourceRow.storageRub, feeRule.storageRub);
  const adRubValue = repricerFirstFilledNumber(sourceRow.adRub, feeRule.adRub);
  const buyerDiscountFactor = currentPrice > 0 && currentClientPrice > 0 ? currentClientPrice / currentPrice : 1;
  const liftThresholdPct = numberOrZero(roleRule.minLiftPct) / 100;
  const elasticityDefault = corridor?.elasticity === '' || corridor?.elasticity == null
    ? numberOrZero(roleRule.elasticityDefault)
    : numberOrZero(corridor.elasticity);
  let preAlignPrice = currentPrice || managedBasePrice || effectiveFloor;
  let cappedPrice = preAlignPrice;
  let recommendedPrice = preAlignPrice;
  let strategy = 'KEEP';
  const reasons = [];
  const pricingProxyPresent = hardFloorPresent || economicFloorFallback > 0 || zoneFrom > 0;
  const outOfSpec = !String(status || '').trim()
    && !skuFact
    && !supportPricingPresent
    && !priceSnapshotPresent
    && !currentPricePresent
    && !pricingProxyPresent
    && numberOrZero(stock) <= 0;
  let criticalGate = outOfSpec ? 'SKIP' : ((!currentPricePresent || !pricingProxyPresent) ? 'BLOCK' : 'OK');
  let launchHold = '';
  let oosFlag = '';
  let turnoverAction = 'KEEP';
  let reasonCode = 'KEEP';

  if (promoActive && !outOfSpec && pricingProxyPresent) {
    criticalGate = 'OK';
    if (!currentPricePresent) reasons.push(promoSource === 'promo_offer' ? 'promo offer без текущей цены' : 'promo override без текущей цены');
  }

  if (!String(status || '').trim()) reasons.push('status not set');
  if (modeCode === 'LAUNCH' && launchReady !== 'READY') {
    launchHold = 'LAUNCH_HOLD';
    reasons.push(`launch_ready = ${launchReady || 'HOLD'}`);
  }
  if (modeCode === 'AUTO' && !autopriceAllowed) reasons.push('autoprice disabled by status');
  if (modeCode === 'LAUNCH' && !launchAllowed) reasons.push('launch disabled by status');
  if (stock <= 0) {
    oosFlag = 'OOS';
    reasons.push('stock_total <= 0');
  } else if (turnoverDays > 0 && oosDays > 0 && turnoverDays <= oosDays) {
    oosFlag = 'LOW_STOCK';
    reasons.push(`покрытие ${fmt.num(turnoverDays, 1)} дн. <= ${fmt.int(oosDays)} дн.`);
  }

  if (modeCode === 'FORCE') {
    turnoverAction = 'FORCE';
  } else if (criticalGate === 'SKIP') {
    turnoverAction = 'OFF';
  } else if (criticalGate === 'BLOCK') {
    turnoverAction = 'BLOCK';
  } else if (modeCode === 'OFF') {
    turnoverAction = 'OFF';
  } else if (modeCode === 'FREEZE') {
    turnoverAction = 'FREEZE';
  } else if (modeCode === 'HOLD') {
    turnoverAction = 'HOLD';
  } else if (modeCode === 'AUTO' && !autopriceAllowed) {
    turnoverAction = 'HOLD';
  } else if (modeCode === 'LAUNCH' && !launchAllowed) {
    turnoverAction = 'HOLD';
  } else if (launchHold) {
    turnoverAction = 'LAUNCH_HOLD';
  } else if (oosFlag === 'OOS') {
    turnoverAction = 'OOS';
  } else if (modeCode === 'LAUNCH') {
    turnoverAction = oosFlag === 'LOW_STOCK' ? 'UP' : 'KEEP';
  } else if (oosFlag === 'LOW_STOCK') {
    turnoverAction = 'UP';
  } else if (!(turnoverDays > 0 && targetDays > 0)) {
    turnoverAction = 'KEEP';
  } else if (turnoverDays >= targetDays * 1.15) {
    turnoverAction = volumePushAllowed ? 'DOWN' : 'KEEP';
  } else if (turnoverDays <= targetDays * 0.85) {
    turnoverAction = 'UP';
  } else {
    turnoverAction = 'KEEP';
  }

  if (turnoverAction === 'BLOCK') {
    preAlignPrice = currentPrice || managedBasePrice || effectiveFloor;
    strategy = 'BLOCK';
    reasons.unshift('нет обязательных входов для автопрайса');
  } else if (criticalGate === 'SKIP') {
    preAlignPrice = 0;
    cappedPrice = 0;
    recommendedPrice = 0;
    strategy = 'OFF';
    reasonCode = 'NO_SPEC';
    reasons.unshift('строка вне спецификации и без ценового контура');
  } else if (['OFF', 'FREEZE', 'HOLD'].includes(turnoverAction)) {
    preAlignPrice = Math.max(currentPrice, effectiveFloor);
    strategy = turnoverAction;
    reasons.unshift(turnoverAction === 'HOLD' ? 'цена удерживается в текущем коридоре' : 'режим удерживает цену без автосдвига');
  } else if (turnoverAction === 'LAUNCH_HOLD') {
    preAlignPrice = Math.max(currentPrice, effectiveFloor);
    strategy = 'LAUNCH_HOLD';
  } else if (['OOS', 'UP'].includes(turnoverAction)) {
    preAlignPrice = Math.max(currentPrice, managedBasePrice, effectiveFloor);
    if (capPrice > 0) preAlignPrice = Math.min(preAlignPrice, Math.max(capPrice, effectiveFloor));
    strategy = turnoverAction;
  } else if (turnoverAction === 'DOWN') {
    preAlignPrice = Math.max(effectiveFloor, Math.min(currentPrice, managedBasePrice || currentPrice));
    strategy = 'DOWN';
  } else {
    preAlignPrice = currentPrice;
    strategy = 'KEEP';
    if (!reasons.length && managedBasePrice > 0) reasons.push('держим текущую цену до alignment');
  }

  cappedPrice = capPrice > 0 ? Math.min(preAlignPrice, Math.max(capPrice, effectiveFloor)) : preAlignPrice;
  recommendedPrice = Math.max(cappedPrice, effectiveFloor);
  reasonCode = turnoverAction;

  if (recommendedPrice < economicFloor) {
    recommendedPrice = economicFloor;
    reasons.push('подняли до economic floor');
  }

  if (modeCode === 'FORCE') {
    recommendedPrice = repricerClamp(numberOrZero(override?.forcePrice) || currentPrice || managedBasePrice || effectiveFloor, effectiveFloor, capPrice || (numberOrZero(override?.forcePrice) || currentPrice || managedBasePrice || effectiveFloor));
    preAlignPrice = recommendedPrice;
    cappedPrice = recommendedPrice;
    reasonCode = 'FORCE';
    strategy = 'FORCE';
    reasons.length = 0;
    reasons.push(`ручная цена ${fmt.money(recommendedPrice)}`);
  }

  if (promoActive && criticalGate !== 'SKIP') {
    const promoResolvedPrice = promoPrice || Math.max(promoRequestedPrice, promoFloor);
    recommendedPrice = promoResolvedPrice;
    preAlignPrice = promoResolvedPrice;
    cappedPrice = promoResolvedPrice;
    turnoverAction = promoSource === 'promo_offer' ? 'PROMO_OFFER' : 'PROMO';
    reasonCode = turnoverAction;
    strategy = turnoverAction;
    reasons.length = 0;
    if (promoRequestedPrice < promoFloor) {
      reasons.push(`${promoSource === 'promo_offer' ? 'предложение акции' : 'акция'} поднята до защитного floor ${fmt.money(promoFloor)}`);
    } else {
      reasons.push(`${promoSource === 'promo_offer' ? 'предложение акции' : 'акционная цена'} ${fmt.money(promoResolvedPrice)}`);
    }
    if (promoLabel) reasons.push(promoLabel);
    if (promoSource === 'promo_offer' && promoSourceLabel) reasons.push(`источник ${promoSourceLabel}`);
  }

  const deltaThresholdRub = Math.max(1, Math.round(Math.abs(numberOrZero(currentPrice)) * liftThresholdPct));
  const floorLiftRequired = numberOrZero(currentPrice) > 0
    && numberOrZero(effectiveFloor) > 0
    && numberOrZero(currentPrice) + 0.001 < numberOrZero(effectiveFloor);
  const changeAbs = Math.abs(numberOrZero(recommendedPrice) - numberOrZero(currentPrice));
  if (['UP', 'DOWN'].includes(turnoverAction) && !floorLiftRequired && numberOrZero(currentPrice) > 0 && changeAbs < deltaThresholdRub) {
    preAlignPrice = currentPrice;
    cappedPrice = currentPrice;
    recommendedPrice = currentPrice;
    turnoverAction = 'KEEP';
    reasonCode = 'KEEP';
    strategy = 'KEEP';
    if (!reasons.length) reasons.push(`изменение меньше порога ${fmt.money(deltaThresholdRub)}`);
  }

  const allowAlignment = Boolean(settings?.global?.alignmentEnabled)
    && Boolean(brandRule.alignmentEnabled)
    && autopriceAllowed
    && Boolean(statusRule.allowAlignment)
    && !Boolean(override?.disableAlignment)
    && !promoActive
    && modeCode === 'AUTO';

  return repricerFinalizeSide(repricerProtectRecommendedPrice({
    platform,
    articleKey,
    brand,
    brandRule,
    status,
    role,
    launchReady,
    currentPrice,
      currentClientPrice,
      sourceMode,
      recommendedPrice,
    preAlignPrice,
    cappedPrice,
    reasonCode,
    hardFloor,
    b2bFloor,
    costRub,
    feeRule,
    feeStackRub,
    economicFloorByFee,
    economicFloorFallback,
    economicFloor,
    economicFloorSource,
    economicFloorSourceLabel,
    marginFloor: economicFloor,
    effectiveFloor,
    floorSourceSummary: effectiveFloorSourceSummary,
    stretchCap,
    capPrice,
    capSourceSummary,
    basePrice: numberOrZero(sourceRow.basePrice),
    managedBasePrice,
    baseSourceSummary: managedBaseSourceSummary,
    targetPrice: managedBasePrice,
    turnoverDays,
    turnoverSource,
    targetDays,
    oosDays,
    stock,
    sales7d,
    skuMinPrice,
    ordersDaily,
    inboundUnits,
    leadTimeDays,
    buyerDiscountFactor,
    commissionPctValue,
    logisticsRubValue,
    storageRubValue,
    adRubValue,
    marginPct: sourceRow.marginTotalPct == null ? (liveSide?.marginPct == null ? null : numberOrZero(liveSide.marginPct)) : numberOrZero(sourceRow.marginTotalPct),
    requiredMarginPct,
    strategy,
    reason: reasons.join(' · ') || sourceRow.seedReason || 'Без пояснения',
    historyFreshnessDate: sourceRow.historyFreshnessDate || '',
    historyNote: sourceRow.historyNote || '',
    mode,
    modeCode,
    engineMode,
    engineModeCode,
    criticalGate,
    outOfSpec,
    pricingProxyPresent,
    rawCostPresent: costPresent,
    launchHold,
    oosFlag,
    turnoverAction,
    stretchMultiplier,
    liftThresholdPct,
    elasticityDefault,
    hasOverride: repricerHasOverride(override),
    override,
    corridor,
    hasCorridor: repricerHasCorridor(corridor),
    disableAlignment: Boolean(override?.disableAlignment),
    allowAlignment,
    promoConfigured,
    promoActive,
    promoRequestedPrice,
    promoPrice,
    promoFloor,
    promoFloorSourceSummary,
    promoLabel,
    promoFrom: promoWindow.from,
    promoTo: promoWindow.to,
    promoWindowStatus: promoWindow.status,
    promoAdjustedToFloor,
    promoSource,
    promoSourceLabel,
    manualPromoConfigured,
    manualPromoActive,
    manualPromoRequestedPrice,
    manualPromoPrice: manualPromoActive ? manualPromoResolvedPrice : 0,
    manualPromoLabel,
    manualPromoFrom: manualPromoWindow.from,
    manualPromoTo: manualPromoWindow.to,
    manualPromoWindowStatus: manualPromoWindow.status,
    manualPromoAdjustedToFloor,
    promoOfferConfigured,
    promoOfferActive,
    promoOfferRequestedPrice,
    promoOfferPrice: promoOfferActive ? promoOfferResolvedPrice : 0,
    promoOfferResolvedPrice,
    promoOfferLabel: promoOffer.label,
    promoOfferFrom: promoOffer.from,
    promoOfferTo: promoOffer.to,
    promoOfferWindowStatus: promoOffer.windowStatus,
    promoOfferAdjustedToFloor,
    promoOfferSource: promoOffer.source,
    promoOfferSourceLabel: promoOffer.sourceLabel,
    promoOfferSourceField: promoOffer.sourceField,
    autopriceAllowed,
    launchAllowed,
    volumePushAllowed,
    alignmentApplied: false,
    liveReferencePrice: numberOrZero(liveSide?.recPrice),
    liveTargetDays: numberOrZero(liveSide?.targetTurnoverDays),
    liveStrategy: liveSide?.strategy || '',
    liveReason: liveSide?.reason || '',
    liveBuyerPrice: numberOrZero(liveSide?.buyerPrice),
    liveMarginPct: liveSide?.marginPct == null ? null : numberOrZero(liveSide.marginPct),
    liveMarginNoAdsMinPct: liveSide?.marginNoAdsMinPct == null ? null : numberOrZero(liveSide.marginNoAdsMinPct)
  }, 'engine'));
}

function repricerApplyAlignment(row, settings) {
  if (!row?.wb || !row?.ozon) return;
  const wb = row.wb;
  const oz = row.ozon;
  const brandRule = repricerBrandRule(row.brand || wb.brand || oz.brand, settings);
  const liftThreshold = Math.max(numberOrZero(wb.liftThresholdPct), numberOrZero(oz.liftThresholdPct));
  const elasticity = Number.isFinite(Number(wb.elasticityDefault)) ? Number(wb.elasticityDefault) : Number(oz.elasticityDefault || -1);
  const wbKeepPrice = numberOrZero(wb.finalPrice);
  const ozKeepPrice = numberOrZero(oz.finalPrice);
  const wbFollowOzonPrice = repricerClamp(ozKeepPrice, wb.effectiveFloor, wb.capPrice || ozKeepPrice || wb.effectiveFloor);
  const ozFollowWbPrice = repricerClamp(wbKeepPrice, oz.effectiveFloor, oz.capPrice || wbKeepPrice || oz.effectiveFloor);
  const wbKeepUnits = numberOrZero(wb.sales7d);
  const ozKeepUnits = numberOrZero(oz.sales7d);
  const wbFollowUnits = repricerProjectedUnits(wbKeepUnits, wb.currentClientPrice, wbFollowOzonPrice * numberOrZero(wb.buyerDiscountFactor || 1), elasticity);
  const ozFollowUnits = repricerProjectedUnits(ozKeepUnits, oz.currentClientPrice, ozFollowWbPrice * numberOrZero(oz.buyerDiscountFactor || 1), elasticity);
  const wbKeepMargin = repricerMarginAtPrice(wbKeepPrice, wb.buyerDiscountFactor, wb.commissionPctValue, wb.logisticsRubValue, wb.storageRubValue, wb.adRubValue, wb.costRub);
  const wbFollowMargin = repricerMarginAtPrice(wbFollowOzonPrice, wb.buyerDiscountFactor, wb.commissionPctValue, wb.logisticsRubValue, wb.storageRubValue, wb.adRubValue, wb.costRub);
  const ozKeepMargin = repricerMarginAtPrice(ozKeepPrice, oz.buyerDiscountFactor, oz.commissionPctValue, oz.logisticsRubValue, oz.storageRubValue, oz.adRubValue, oz.costRub);
  const ozFollowMargin = repricerMarginAtPrice(ozFollowWbPrice, oz.buyerDiscountFactor, oz.commissionPctValue, oz.logisticsRubValue, oz.storageRubValue, oz.adRubValue, oz.costRub);
  const keepScore = wbKeepUnits * wbKeepMargin + ozKeepUnits * ozKeepMargin;
  const wbFollowScore = wbFollowUnits * wbFollowMargin + ozKeepUnits * ozKeepMargin;
  const ozFollowScore = wbKeepUnits * wbKeepMargin + ozFollowUnits * ozFollowMargin;
  const priceDeltaAbs = Math.abs(wbKeepPrice - ozKeepPrice);
  const priceDeltaPct = priceDeltaAbs / Math.max(wbKeepPrice, ozKeepPrice, 1);
  const statusRaw = String(row.status || '').toLowerCase();
  const brandAlignmentDefault = brandRule.alignmentEnabled ? 'Y' : 'N';
  const eligibleAlignment = Boolean(
    statusRaw.includes('актуал')
    && wb.modeCode === 'AUTO'
    && oz.modeCode === 'AUTO'
    && wb.currentPrice > 0
    && oz.currentPrice > 0
    && brandAlignmentDefault === 'Y'
    && wb.allowAlignment
    && oz.allowAlignment
  );
  const deltaGate = priceDeltaAbs >= numberOrZero(settings?.global?.deadbandRub) || priceDeltaPct >= numberOrZero(settings?.global?.deadbandPct) / 100;
  let chosenScenario = 'KEEP';
  let reasonAlignment = 'BLOCK_MODE';
  if (!eligibleAlignment) {
    reasonAlignment = 'BLOCK_MODE';
  } else if (!deltaGate) {
    reasonAlignment = 'DEADBAND';
  } else if (wbFollowScore > keepScore * (1 + liftThreshold) && wbFollowScore >= ozFollowScore) {
    chosenScenario = 'WB_FOLLOW_OZON';
    reasonAlignment = 'SCORE_WB_FOLLOW';
  } else if (ozFollowScore > keepScore * (1 + liftThreshold) && ozFollowScore > wbFollowScore) {
    chosenScenario = 'OZON_FOLLOW_WB';
    reasonAlignment = 'SCORE_OZON_FOLLOW';
  } else {
    reasonAlignment = 'KEEP_BEST';
  }
  const finalWbPrice = chosenScenario === 'WB_FOLLOW_OZON' ? wbFollowOzonPrice : wbKeepPrice;
  const finalOzonPrice = chosenScenario === 'OZON_FOLLOW_WB' ? ozFollowWbPrice : ozKeepPrice;
  const alignmentApplied = eligibleAlignment && deltaGate && chosenScenario !== 'KEEP';

  Object.assign(wb, {
    keepPrice: wbKeepPrice,
    followPrice: wbFollowOzonPrice,
    keepUnits: wbKeepUnits,
    followUnits: wbFollowUnits,
    keepMargin: wbKeepMargin,
    followMargin: wbFollowMargin,
    keepScore,
    followScore: wbFollowScore,
    pairKeepScore: keepScore,
    pairOtherFollowScore: ozFollowScore,
    priceDeltaAbs,
    priceDeltaPct,
    brandAlignmentDefault,
    eligibleAlignment,
    deltaGate,
    chosenScenario,
    reasonAlignment,
    finalReasonCode: wb.promoActive ? 'PROMO' : reasonAlignment,
    alignmentApplied
  });
  Object.assign(oz, {
    keepPrice: ozKeepPrice,
    followPrice: ozFollowWbPrice,
    keepUnits: ozKeepUnits,
    followUnits: ozFollowUnits,
    keepMargin: ozKeepMargin,
    followMargin: ozFollowMargin,
    keepScore,
    followScore: ozFollowScore,
    pairKeepScore: keepScore,
    pairOtherFollowScore: wbFollowScore,
    priceDeltaAbs,
    priceDeltaPct,
    brandAlignmentDefault,
    eligibleAlignment,
    deltaGate,
    chosenScenario,
    reasonAlignment,
    finalReasonCode: oz.promoActive ? 'PROMO' : reasonAlignment,
    alignmentApplied
  });

  wb.recommendedPrice = finalWbPrice;
  oz.recommendedPrice = finalOzonPrice;
  if (!wb.promoActive) wb.reason = `${wb.reason} · ${reasonAlignment}`;
  if (!oz.promoActive) oz.reason = `${oz.reason} · ${reasonAlignment}`;
  repricerProtectRecommendedPrice(wb, 'align');
  repricerProtectRecommendedPrice(oz, 'align');
  repricerFinalizeSide(wb);
  repricerFinalizeSide(oz);

  row.alignmentEligible = eligibleAlignment;
  row.alignmentChanged = alignmentApplied;
  row.alignmentScenario = chosenScenario;
  row.alignmentReason = reasonAlignment;
}

function repricerRunWorkbookSmokeTests(settings) {
  const cases = [
    { id: 'AUTO_keep', role: 'Hero', status: 'Актуальный', launchReady: 'READY', stock: 460, turnoverDays: 11, expectedMode: 'AUTO', expectedReason: 'KEEP' },
    { id: 'LAUNCH_hold', role: 'Launch', status: 'Новинка', launchReady: 'HOLD', stock: 175, turnoverDays: 29, expectedMode: 'LAUNCH', expectedReason: 'LAUNCH_HOLD' },
    { id: 'FREEZE_block', role: 'Freeze', status: 'Под вопросом', launchReady: 'READY', stock: 120, turnoverDays: 20, expectedMode: 'FREEZE', expectedReason: 'FREEZE' },
    { id: 'OOS_case', role: 'Hero', status: 'Актуальный', launchReady: 'READY', stock: 0, turnoverDays: 0, expectedMode: 'AUTO', expectedReason: 'OOS' },
    { id: 'ALTEA_30d', role: 'Margin', status: 'Актуальный', launchReady: 'READY', stock: 300, turnoverDays: 30, expectedMode: 'AUTO', expectedReason: 'KEEP' },
    { id: 'PROMO_offer', role: 'Hero', status: 'Актуальный', launchReady: 'READY', stock: 240, turnoverDays: 18, expectedMode: 'AUTO', expectedReason: 'PROMO_OFFER', sourceRowPatch: { promoOfferPrice: 840, promoLabel: 'market promo' } }
  ];
  return cases.map((item) => {
    const side = buildRepricerSide({
      articleKey: `test_${item.id}`,
      article: `test_${item.id}`,
      status: item.status,
      segment: item.role,
      currentFillPrice: 1000,
      currentClientPrice: 820,
      basePrice: 1000,
      workingZoneFrom: 950,
      workingZoneTo: 1100,
      hardMinPrice: 700,
      requiredPriceForProfitability: 700,
      requiredPriceForMargin: 780,
      allowedMarginPct: 0.15,
      turnoverCurrentDays: item.turnoverDays,
      stock: item.stock,
      cost: 200,
      ...(item.sourceRowPatch || {})
    }, 'wb', settings, {
      status: item.status,
      role: item.role,
      launchReady: item.launchReady,
      liveRow: null,
      skuFact: null,
      supportRow: item.supportRow || null,
      priceRow: item.priceRow || null
    });
    const pass = side.modeCode === item.expectedMode && side.reasonCode === item.expectedReason;
    return {
      ...item,
      actualMode: side.modeCode,
      actualReason: side.reasonCode,
      pass
    };
  });
}

function buildRepricerRows() {
  const settings = normalizeRepricerSettings(state.storage?.repricerSettings || {});
  const platforms = state.smartPriceWorkbench?.platforms || {};
  const liveMap = repricerLiveMap();
  const skuMap = repricerSkuFactMap();
  const supportMaps = {
    wb: repricerSupportMap('wb'),
    ozon: repricerSupportMap('ozon')
  };
  const pricesMaps = {
    wb: repricerPricesMap('wb'),
    ozon: repricerPricesMap('ozon')
  };
  const byArticle = new Map();
  ['wb', 'ozon'].forEach((platform) => {
    const rows = Array.isArray(platforms?.[platform]?.rows) ? platforms[platform].rows : [];
    rows.forEach((sourceRow) => {
      const articleKey = sourceRow.articleKey || sourceRow.article || '';
      if (!articleKey) return;
      const normalizedKey = repricerNormalizeArticleKey(articleKey);
      const liveRow = liveMap.get(normalizedKey) || null;
      const skuFact = skuMap.get(normalizedKey) || null;
      const supportRow = supportMaps[platform].get(normalizedKey) || null;
      const priceRow = pricesMaps[platform].get(normalizedKey) || null;
      const profile = repricerFindSkuProfile(articleKey);
      const skuOwnerName = typeof skuFact?.owner === 'object' ? skuFact.owner?.name : skuFact?.owner;
      const platformSpecificOwner = typeof platformOwnerName === 'function'
        ? platformOwnerName(skuFact, platform)
        : '';
      const resolvedStatus = profile?.status || sourceRow.status || supportRow?.repricerStatus || supportRow?.productStatus || skuFact?.status || '';
      const resolvedRole = profile?.role || repricerSuggestedRole(resolvedStatus, sourceRow.segment || supportRow?.segment || skuFact?.segment);
      const resolvedLaunchReady = normalizeRepricerLaunchReady(profile?.launchReady || repricerDefaultLaunchReady(resolvedStatus));
      if (!byArticle.has(articleKey)) byArticle.set(articleKey, {
        articleKey,
        article: sourceRow.article || articleKey,
        brand: sourceRow.brand || skuFact?.brand || '',
        name: sourceRow.name || supportRow?.name || priceRow?.name || skuFact?.name || '',
        owner: platformSpecificOwner || sourceRow.owner || supportRow?.owner || priceRow?.owner || skuOwnerName || '',
        status: resolvedStatus,
        role: resolvedRole,
        launchReady: resolvedLaunchReady,
        segment: sourceRow.segment || supportRow?.segment || skuFact?.segment || '',
        abc: sourceRow.abc || supportRow?.abc || skuFact?.abc || '',
        profile,
        liveRow,
        skuFact,
        wb: null,
        ozon: null
      });
      const row = byArticle.get(articleKey);
      row.article = row.article || sourceRow.article || articleKey;
      row.brand = row.brand || sourceRow.brand || skuFact?.brand || '';
      row.name = row.name || sourceRow.name || supportRow?.name || priceRow?.name || skuFact?.name || '';
      row.owner = row.owner || platformSpecificOwner || sourceRow.owner || supportRow?.owner || priceRow?.owner || skuOwnerName || '';
      row.status = profile?.status || row.status || sourceRow.status || supportRow?.repricerStatus || supportRow?.productStatus || skuFact?.status || '';
      row.role = profile?.role || row.role || repricerSuggestedRole(row.status || sourceRow.status || supportRow?.repricerStatus || skuFact?.status, sourceRow.segment || supportRow?.segment || skuFact?.segment);
      row.launchReady = normalizeRepricerLaunchReady(profile?.launchReady || row.launchReady || repricerDefaultLaunchReady(row.status || sourceRow.status || skuFact?.status));
      row.segment = row.segment || sourceRow.segment || supportRow?.segment || skuFact?.segment || '';
      row.abc = row.abc || sourceRow.abc || supportRow?.abc || skuFact?.abc || '';
      row.profile = profile || row.profile || null;
      row.liveRow = row.liveRow || liveRow || null;
      row.skuFact = row.skuFact || skuFact || null;
      row[platform] = buildRepricerSide(sourceRow, platform, settings, {
        brand: row.brand,
        status: row.status,
        role: row.role,
        launchReady: row.launchReady,
        liveRow: row.liveRow,
        skuFact: row.skuFact,
        supportRow,
        priceRow
      });
    });
  });
  return [...byArticle.values()].map((row) => {
    repricerApplyAlignment(row, settings);
    row.hasManualOverride = Boolean(row.wb?.hasOverride || row.ozon?.hasOverride);
    row.hasManagedProfile = repricerHasSkuProfile(row.profile);
    row.hasCorridor = Boolean(row.wb?.hasCorridor || row.ozon?.hasCorridor);
    row.promoActive = Boolean(row.wb?.promoActive || row.ozon?.promoActive);
    row.promoConfigured = Boolean(row.wb?.promoConfigured || row.ozon?.promoConfigured);
    row.changed = Boolean(row.wb?.changed || row.ozon?.changed);
    row.belowFloorNow = Boolean(row.wb?.belowFloorNow || row.ozon?.belowFloorNow);
    row.marginRisk = Boolean(row.wb?.marginRisk || row.ozon?.marginRisk);
    row.liveBenchmark = Boolean(row.wb?.hasLiveBenchmark || row.ozon?.hasLiveBenchmark);
    row.liveDrift = Boolean(row.wb?.liveDrift || row.ozon?.liveDrift);
    row.blockedByGate = Boolean(row.wb?.criticalGate === 'BLOCK' || row.ozon?.criticalGate === 'BLOCK');
    row.launchHold = Boolean(row.wb?.launchHold || row.ozon?.launchHold);
    row.alignmentEligible = Boolean(row.alignmentEligible);
    row.alignmentChanged = Boolean(row.alignmentChanged);
    row.blocked = ['freeze', 'hold', 'force', 'off'].includes(row.wb?.mode) || ['freeze', 'hold', 'force', 'off'].includes(row.ozon?.mode);
    row.searchIndex = [row.article, row.articleKey, row.brand, row.name, row.owner, row.status, row.role, row.launchReady, row.segment, row.abc, row.alignmentScenario, row.alignmentReason, row.wb?.reason, row.ozon?.reason, row.wb?.reasonCode, row.ozon?.reasonCode, row.wb?.liveStrategy, row.ozon?.liveStrategy, row.wb?.liveReason, row.ozon?.liveReason, row.wb?.promoLabel, row.ozon?.promoLabel, row.wb?.promoSourceLabel, row.ozon?.promoSourceLabel, row.wb?.promoOfferLabel, row.ozon?.promoOfferLabel, row.wb?.promoOfferSourceLabel, row.ozon?.promoOfferSourceLabel].filter(Boolean).join(' ').toLowerCase();
    row.maxAbsDelta = Math.max(Math.abs(numberOrZero(row.wb?.changeRub)), Math.abs(numberOrZero(row.ozon?.changeRub)));
    return row;
  }).sort((a, b) => Number(b.hasManualOverride) - Number(a.hasManualOverride)
    || Number(b.hasManagedProfile) - Number(a.hasManagedProfile)
    || Number(b.hasCorridor) - Number(a.hasCorridor)
    || Number(b.blockedByGate) - Number(a.blockedByGate)
    || Number(b.launchHold) - Number(a.launchHold)
    || Number(b.alignmentChanged) - Number(a.alignmentChanged)
    || Number(b.liveDrift) - Number(a.liveDrift)
    || Number(b.belowFloorNow) - Number(a.belowFloorNow)
    || Number(b.marginRisk) - Number(a.marginRisk)
    || Number(b.changed) - Number(a.changed)
    || numberOrZero(b.maxAbsDelta) - numberOrZero(a.maxAbsDelta)
    || String(a.article || a.articleKey).localeCompare(String(b.article || b.articleKey), 'ru'));
}

function repricerModeMatches(row, platform, mode) {
  const byPlatform = {
    wb: {
      changed: Boolean(row?.wb?.changed),
      below: Boolean(row?.wb?.belowFloorNow),
      margin: Boolean(row?.wb?.marginRisk),
      manual: Boolean(row?.wb?.hasOverride),
      promo: Boolean(row?.wb?.promoConfigured || row?.wb?.promoActive),
      live: Boolean(row?.wb?.hasLiveBenchmark),
      liveDrift: Boolean(row?.wb?.liveDrift),
      blocked: ['freeze', 'hold', 'force', 'off'].includes(row?.wb?.mode) || row?.wb?.criticalGate === 'BLOCK'
    },
    ozon: {
      changed: Boolean(row?.ozon?.changed),
      below: Boolean(row?.ozon?.belowFloorNow),
      margin: Boolean(row?.ozon?.marginRisk),
      manual: Boolean(row?.ozon?.hasOverride),
      promo: Boolean(row?.ozon?.promoConfigured || row?.ozon?.promoActive),
      live: Boolean(row?.ozon?.hasLiveBenchmark),
      liveDrift: Boolean(row?.ozon?.liveDrift),
      blocked: ['freeze', 'hold', 'force', 'off'].includes(row?.ozon?.mode) || row?.ozon?.criticalGate === 'BLOCK'
    },
    all: {
      changed: Boolean(row?.changed),
      below: Boolean(row?.belowFloorNow),
      margin: Boolean(row?.marginRisk),
      manual: Boolean(row?.hasManualOverride),
      promo: Boolean(row?.promoConfigured || row?.promoActive),
      live: Boolean(row?.liveBenchmark),
      liveDrift: Boolean(row?.liveDrift),
      blocked: Boolean(row?.blocked || row?.blockedByGate)
    }
  };
  const scope = byPlatform[platform || 'all'] || byPlatform.all;
  if (mode === 'all') return true;
  if (mode === 'changes') return scope.changed;
  if (mode === 'manual') return scope.manual;
  if (mode === 'promo') return scope.promo;
  if (mode === 'blocked') return scope.blocked;
  if (mode === 'below_min') return scope.below;
  if (mode === 'margin_risk') return scope.margin;
  if (mode === 'live_benchmark') return scope.live;
  if (mode === 'live_drift') return scope.liveDrift;
  return true;
}

function repricerEconomicSourceMatches(row, platform, source) {
  if (source === 'all') return true;
  const sourceMatches = (side) => {
    if (!side) return false;
    if (source === 'fee_stack') return side.economicFloorSource === 'fee_stack';
    if (source === 'snapshot_guard') return side.economicFloorSource === 'snapshot_guard';
    if (source === 'snapshot_fallback') return side.economicFloorSource === 'snapshot_fallback';
    if (source === 'ready') return side.economicFloorSource === 'fee_stack' || side.economicFloorSource === 'snapshot_guard';
    return true;
  };
  if (platform === 'wb') return sourceMatches(row?.wb);
  if (platform === 'ozon') return sourceMatches(row?.ozon);
  return sourceMatches(row?.wb) || sourceMatches(row?.ozon);
}

function getFilteredRepricerRows() {
  const search = String(state.repricerFilters.search || '').trim().toLowerCase();
  const platform = state.repricerFilters.platform || 'all';
  const mode = state.repricerFilters.mode || 'changes';
  const economicSource = state.repricerFilters.economicSource || 'all';
  return buildRepricerRows().filter((row) => {
    if (search && !String(row.searchIndex || '').includes(search)) return false;
    if (platform === 'wb' && !row?.wb) return false;
    if (platform === 'ozon' && !row?.ozon) return false;
    if (!repricerModeMatches(row, platform, mode)) return false;
    if (!repricerEconomicSourceMatches(row, platform, economicSource)) return false;
    return true;
  });
}

function renderRepricerSide(title, side) {
  if (!side) {
    return `<div class="repricer-side"><div class="repricer-side-head">${escapeHtml(title)}</div><div class="muted small">Нет данных по площадке.</div></div>`;
  }
  const override = side.override || null;
  const corridor = side.corridor || null;
  return `
    <div class="repricer-side ${side.changed ? 'changed' : ''}">
      <div class="repricer-side-head">${escapeHtml(title)} <span class="badge-stack">${badge(repricerModeLabel(side.mode), repricerModeTone(side.mode))}${side.manualPromoConfigured ? badge(repricerPromoWindowLabel({ status: side.manualPromoWindowStatus }), side.manualPromoActive ? 'warn' : 'info') : ''}${side.promoOfferConfigured ? badge(repricerPromoWindowLabel({ status: side.promoOfferWindowStatus }, 'offer'), side.promoSource === 'promo_offer' && side.promoActive ? 'info' : 'warn') : ''}${side.promoSource === 'promo_offer' ? badge('offer drives price', 'info') : ''}${side.hasOverride ? badge('override', 'warn') : ''}${side.hasCorridor ? badge('corridor', 'info') : ''}${side.alignmentApplied ? badge('align', 'info') : ''}</span></div>
      <div class="repricer-prices">
        <div><span>Текущая</span><strong>${fmt.money(side.currentPrice)}</strong></div>
        <div><span>Финал</span><strong>${fmt.money(side.finalPrice)}</strong></div>
        <div><span>Δ</span><strong>${side.changePct == null ? '—' : fmt.pct(side.changePct)}</strong></div>
      </div>
      <div class="badge-stack" style="margin-top:8px">
        ${badge(`floor ${fmt.money(side.effectiveFloor)}`, side.belowFloorNow ? 'danger' : '')}
        ${badge(`econ ${fmt.money(side.economicFloor)}`, side.economicFloorSource === 'snapshot_fallback' ? 'warn' : 'ok')}
        ${badge(`cap ${fmt.money(side.capPrice || side.stretchCap)}`)}
        ${badge(`pre ${fmt.money(side.preAlignPrice)}`, 'info')}
        ${badge(`capped ${fmt.money(side.cappedPrice)}`, 'info')}
        ${side.promoActive ? badge(`${side.promoSource === 'promo_offer' ? 'offer' : 'promo'} ${fmt.money(side.promoPrice)}`, side.promoSource === 'promo_offer' ? 'info' : 'warn') : ''}
        ${badge(`оборот ${fmt.num(side.turnoverDays, 1)} дн.`, side.lowStockRisk ? 'warn' : '')}
        ${side.marginPct == null ? '' : badge(`маржа ${fmt.pct(side.marginPct)}`, side.marginRisk ? 'danger' : 'ok')}
        ${side.hasLiveBenchmark ? badge(`live ${fmt.money(side.liveReferencePrice)}`, side.liveDrift ? 'warn' : 'info') : ''}
      </div>
      <div class="badge-stack" style="margin-top:8px">
        ${badge(`роль ${escapeHtml(side.role || '—')}`, 'info')}
        ${badge(`launch ${escapeHtml(side.launchReady || '—')}`, side.launchHold ? 'warn' : '')}
        ${badge(`action ${escapeHtml(side.turnoverAction || 'KEEP')}`)}
        ${badge(`reason ${escapeHtml(side.reasonCode || 'KEEP')}`, side.reasonCode === 'BLOCK' ? 'danger' : 'info')}
        ${side.finalReasonCode && !side.promoActive ? badge(`align ${escapeHtml(side.finalReasonCode)}`, side.alignmentApplied ? 'ok' : 'info') : ''}
        ${badge(side.economicFloorSource === 'fee_stack' ? 'econ: fee stack' : side.economicFloorSource === 'snapshot_guard' ? 'econ: mixed guard' : 'econ: fallback', side.economicFloorSource === 'snapshot_fallback' ? 'warn' : 'info')}
        ${side.autopriceAllowed ? badge('auto on', 'ok') : badge('auto off', 'warn')}
        ${side.engineModeCode === 'LAUNCH' ? (side.launchAllowed ? badge('launch on', 'ok') : badge('launch off', 'warn')) : ''}
        ${side.volumePushAllowed ? badge('volume push', 'info') : badge('margin guard', 'ok')}
        ${side.allowAlignment ? badge('align on', 'ok') : badge('align off', 'warn')}
        ${side.promoConfigured ? badge(side.promoActive ? (side.promoAdjustedToFloor ? `${side.promoSource === 'promo_offer' ? 'offer' : 'promo'} + floor guard` : `${side.promoSource === 'promo_offer' ? 'offer' : 'promo'} fixed`) : repricerPromoWindowLabel({ status: side.promoWindowStatus }, side.promoSource === 'promo_offer' ? 'offer' : 'promo'), side.promoSource === 'promo_offer' ? 'info' : (side.promoActive ? 'warn' : 'info')) : ''}
        ${side.liveDeltaPct == null ? '' : badge(`vs live ${side.liveDeltaPct > 0 ? '+' : ''}${fmt.pct(side.liveDeltaPct)}`, side.liveDrift ? 'warn' : 'ok')}
      </div>
      <div class="muted small" style="margin-top:8px"><strong>${escapeHtml(side.strategy || 'Стратегия не определена')}</strong></div>
      <div class="muted small" style="margin-top:6px">${escapeHtml(side.reason || 'Причина не указана')}</div>
      <div class="muted small" style="margin-top:6px">Sources: min ${escapeHtml(side.floorSourceSummary || '—')} · max ${escapeHtml(side.capSourceSummary || '—')} · base ${escapeHtml(side.baseSourceSummary || '—')}${side.promoConfigured ? ` · promo floor ${escapeHtml(side.promoFloorSourceSummary || '—')}` : ''}</div>
      ${side.floorGuardApplied || side.capGuardApplied ? `<div class="muted small" style="margin-top:6px">Guards: floor ${fmt.money(side.finalGuardFloor)}${side.capGuardApplied ? ` · cap ${fmt.money(side.finalGuardCap)}` : ''}</div>` : ''}
      ${side.promoConfigured ? `<div class="muted small" style="margin-top:6px">Активный промо-сценарий: ${side.promoActive ? fmt.money(side.promoPrice) : 'не активен'}${side.promoSource ? ` · ${escapeHtml(side.promoSource === 'promo_offer' ? 'предложение акции' : 'ручной override')}` : ''}${side.promoSource === 'promo_offer' && side.promoSourceLabel ? ` · ${escapeHtml(side.promoSourceLabel)}` : ''}${side.promoLabel ? ` · ${escapeHtml(side.promoLabel)}` : ''}${side.promoFrom ? ` · с ${escapeHtml(side.promoFrom)}` : ''}${side.promoTo ? ` · по ${escapeHtml(side.promoTo)}` : ''}${side.promoAdjustedToFloor ? ` · защитный floor ${fmt.money(side.promoFloor)}` : ''}</div>` : ''}
      ${side.manualPromoConfigured ? `<div class="muted small" style="margin-top:6px">Ручное промо: ${fmt.money(side.manualPromoRequestedPrice)}${side.manualPromoLabel ? ` · ${escapeHtml(side.manualPromoLabel)}` : ''}${side.manualPromoFrom ? ` · с ${escapeHtml(side.manualPromoFrom)}` : ''}${side.manualPromoTo ? ` · по ${escapeHtml(side.manualPromoTo)}` : ''}${side.manualPromoAdjustedToFloor ? ` · floor guard ${fmt.money(side.promoFloor)}` : ''}</div>` : ''}
      ${side.promoOfferConfigured ? `<div class="muted small" style="margin-top:6px">Предложение акции: ${fmt.money(side.promoOfferRequestedPrice)}${side.promoOfferSourceLabel ? ` · ${escapeHtml(side.promoOfferSourceLabel)}` : ''}${side.promoOfferLabel ? ` · ${escapeHtml(side.promoOfferLabel)}` : ''}${side.promoOfferFrom ? ` · с ${escapeHtml(side.promoOfferFrom)}` : ''}${side.promoOfferTo ? ` · по ${escapeHtml(side.promoOfferTo)}` : ''}${side.promoOfferAdjustedToFloor ? ` · floor guard ${fmt.money(side.promoFloor)}` : ''}</div>` : ''}
      ${side.chosenScenario && !side.promoActive ? `<div class="muted small" style="margin-top:6px">Alignment: ${escapeHtml(side.chosenScenario)} · keep ${fmt.money(side.keepPrice)} · follow ${fmt.money(side.followPrice)} · score keep ${fmt.num(side.keepScore, 0)} · score follow ${fmt.num(side.followScore, 0)}</div>` : ''}
      ${side.hasLiveBenchmark ? `<div class="muted small" style="margin-top:6px">Live repricer: ${escapeHtml(side.liveStrategy || 'без стратегии')} · target ${fmt.int(side.liveTargetDays)} дн.${side.liveReason ? ` · ${escapeHtml(side.liveReason)}` : ''}</div>` : ''}
      ${side.skuMinPrice > 0 || side.ordersDaily > 0 || side.inboundUnits > 0 || side.leadTimeDays > 0 ? `<div class="muted small" style="margin-top:6px">SKU/Order: min ${fmt.money(side.skuMinPrice)} · заказы ${fmt.num(side.ordersDaily, 1)} шт./день · в пути ${fmt.int(side.inboundUnits)} · lead ${fmt.int(side.leadTimeDays)} дн. · turnover ${escapeHtml(side.turnoverSource || '—')}</div>` : ''}
      <details style="margin-top:10px">
        <summary class="small muted" style="cursor:pointer">Управлять площадкой</summary>
        <div class="muted small" style="margin-top:10px">Engine: ${escapeHtml(side.engineModeCode || 'AUTO')} · Gate: ${escapeHtml(side.criticalGate || 'OK')} · Stock flag: ${escapeHtml(side.oosFlag || '—')} · Sales7d: ${fmt.num(side.sales7d, 1)} · buyer factor: ${fmt.num(side.buyerDiscountFactor, 3)}</div>
        <form class="repricer-corridor-form" data-article-key="${escapeHtml(side.articleKey)}" data-platform="${escapeHtml(side.platform)}" style="margin-top:10px">
          <div class="filters repricer-filters">
            <input type="number" step="1" min="0" name="hardFloor" value="${escapeHtml(corridor?.hardFloor ?? '')}" placeholder="Hard floor, ₽">
            <input type="number" step="1" min="0" name="b2bFloor" value="${escapeHtml(corridor?.b2bFloor ?? '')}" placeholder="B2B floor, ₽">
            <input type="number" step="1" min="0" name="basePrice" value="${escapeHtml(corridor?.basePrice ?? '')}" placeholder="Base price, ₽">
            <input type="number" step="1" min="0" name="stretchCap" value="${escapeHtml(corridor?.stretchCap ?? '')}" placeholder="Stretch cap, ₽">
            <input type="number" step="1" min="0" name="promoFloor" value="${escapeHtml(corridor?.promoFloor ?? '')}" placeholder="Promo floor, ₽">
            <input type="number" step="0.1" name="elasticity" value="${escapeHtml(corridor?.elasticity ?? '')}" placeholder="Elasticity">
          </div>
          <div class="quick-actions" style="margin-top:10px">
            <button type="submit" class="quick-chip">Сохранить коридор</button>
            <button type="button" class="quick-chip" data-repricer-corridor-reset data-article-key="${escapeHtml(side.articleKey)}" data-platform="${escapeHtml(side.platform)}">Сбросить коридор</button>
          </div>
        </form>
        <form class="repricer-override-form" data-article-key="${escapeHtml(side.articleKey)}" data-platform="${escapeHtml(side.platform)}" style="margin-top:12px">
          <div class="filters repricer-filters">
            <select name="mode">
              <option value="auto" ${override?.mode === 'auto' ? 'selected' : ''}>Auto</option>
              <option value="hold" ${override?.mode === 'hold' ? 'selected' : ''}>Hold</option>
              <option value="freeze" ${override?.mode === 'freeze' ? 'selected' : ''}>Freeze</option>
              <option value="force" ${override?.mode === 'force' ? 'selected' : ''}>Force</option>
            </select>
            <input type="number" step="1" min="0" name="floorPrice" value="${escapeHtml(override?.floorPrice ?? '')}" placeholder="Manual floor, ₽">
            <input type="number" step="1" min="0" name="capPrice" value="${escapeHtml(override?.capPrice ?? '')}" placeholder="Manual cap, ₽">
            <input type="number" step="1" min="0" name="forcePrice" value="${escapeHtml(override?.forcePrice ?? '')}" placeholder="Force price, ₽">
          </div>
          <div class="filters repricer-filters" style="margin-top:8px">
            <label class="muted small" style="display:flex; align-items:center; gap:8px">
              <input type="checkbox" name="promoActive" ${override?.promoActive ? 'checked' : ''}>
              Акционная цена
            </label>
            <input type="number" step="1" min="0" name="promoPrice" value="${escapeHtml(override?.promoPrice ?? '')}" placeholder="Promo price, ₽">
            <input type="text" name="promoLabel" value="${escapeHtml(override?.promoLabel ?? '')}" placeholder="Акция / причина">
          </div>
          <div class="filters repricer-filters" style="margin-top:8px">
            <input type="date" name="promoFrom" value="${escapeHtml(override?.promoFrom ?? '')}" placeholder="Promo from">
            <input type="date" name="promoTo" value="${escapeHtml(override?.promoTo ?? '')}" placeholder="Promo to">
          </div>
          <label class="muted small" style="display:flex; align-items:center; gap:8px; margin-top:8px">
            <input type="checkbox" name="disableAlignment" ${override?.disableAlignment ? 'checked' : ''}>
            Не выравнивать с другой площадкой
          </label>
          <div class="muted small" style="margin-top:6px">Промо фиксирует итоговую цену только внутри окна акции, помечает строку как акционную и на этот период выключает alignment. Защитный floor при этом остается активным.</div>
          ${side.promoOfferConfigured ? `<div class="muted small" style="margin-top:6px">В фактах уже есть предложение акции: ${fmt.money(side.promoOfferRequestedPrice)}${side.promoOfferSourceLabel ? ` · ${escapeHtml(side.promoOfferSourceLabel)}` : ''}${side.promoOfferLabel ? ` · ${escapeHtml(side.promoOfferLabel)}` : ''}</div>` : ''}
          ${side.promoOfferConfigured ? `<div class="quick-actions" style="margin-top:8px"><button type="button" class="quick-chip" data-repricer-adopt-offer data-article-key="${escapeHtml(side.articleKey)}" data-platform="${escapeHtml(side.platform)}">Принять предложение акции</button></div>` : ''}
          <textarea name="note" rows="2" placeholder="Комментарий" style="margin-top:8px; width:100%">${escapeHtml(override?.note || '')}</textarea>
          <div class="quick-actions" style="margin-top:10px">
            <button type="submit" class="quick-chip">Сохранить override</button>
            <button type="button" class="quick-chip" data-repricer-reset data-article-key="${escapeHtml(side.articleKey)}" data-platform="${escapeHtml(side.platform)}">Сбросить override</button>
          </div>
        </form>
        <div class="muted small" style="margin-top:8px">Источник: ${escapeHtml(side.historyFreshnessDate || '—')}${side.historyNote ? ` · ${escapeHtml(side.historyNote)}` : ''}</div>
      </details>
    </div>
  `;
}

function persistRepricerState() {
  saveLocalStorage();
  if (typeof persistRepricerControls === 'function') persistRepricerControls().catch((error) => console.error(error));
  renderRepricer();
}

function clearRepricerDeleteTombstone(bucket, articleKey, platform = 'all', withPlatform = true) {
  const keyArticle = String(articleKey || '').trim();
  if (!keyArticle) return;
  state.storage[bucket] = (state.storage[bucket] || []).filter((item) => {
    if (String(item.articleKey || '').trim() !== keyArticle) return true;
    if (!withPlatform) return false;
    return String(item.platform || 'all').trim().toLowerCase() !== String(platform || 'all').trim().toLowerCase();
  });
}

function markRepricerDeleteTombstone(bucket, articleKey, platform = 'all', withPlatform = true) {
  const keyArticle = String(articleKey || '').trim();
  if (!keyArticle) return;
  const next = normalizeRepricerDeleteTombstone({
    articleKey: keyArticle,
    platform: withPlatform ? platform : 'all',
    deletedAt: new Date().toISOString(),
    updatedBy: state.team?.member?.name || 'Команда'
  });
  clearRepricerDeleteTombstone(bucket, keyArticle, platform, withPlatform);
  state.storage[bucket] = state.storage[bucket] || [];
  state.storage[bucket].unshift(next);
}

function saveRepricerSettings(form) {
  const brandRules = {};
  form.querySelectorAll('[data-repricer-brand-card]').forEach((card) => {
    const brand = card.getAttribute('data-repricer-brand-card') || '';
    if (!brand) return;
    brandRules[brand] = normalizeRepricerBrandRule({
      defaultTargetDays: card.querySelector('[name="defaultTargetDays"]')?.value,
      launchTargetDays: card.querySelector('[name="launchTargetDays"]')?.value,
      oosDays: card.querySelector('[name="oosDays"]')?.value,
      minMarginPct: card.querySelector('[name="minMarginPct"]')?.value,
      alignmentEnabled: card.querySelector('[name="alignmentEnabled"]')?.checked
    });
  });
  const statusRules = {};
  form.querySelectorAll('[data-repricer-status-card]').forEach((card) => {
    const status = card.getAttribute('data-repricer-status-card') || '';
    if (!status) return;
    statusRules[status] = normalizeRepricerStatusRule({
      mode: card.querySelector('[name="mode"]')?.value,
      allowAutoprice: card.querySelector('[name="allowAutoprice"]')?.checked,
      allowLaunch: card.querySelector('[name="allowLaunch"]')?.checked,
      allowAlignment: card.querySelector('[name="allowAlignment"]')?.checked
    });
  });
  const roleRules = {};
  form.querySelectorAll('[data-repricer-role-card]').forEach((card) => {
    const role = card.getAttribute('data-repricer-role-card') || '';
    if (!role) return;
    roleRules[role] = normalizeRepricerRoleRule({
      targetDays: card.querySelector('[name="targetDays"]')?.value,
      minLiftPct: card.querySelector('[name="minLiftPct"]')?.value,
      stretchMultiplier: card.querySelector('[name="stretchMultiplier"]')?.value,
      allowVolumePush: card.querySelector('[name="allowVolumePush"]')?.checked,
      elasticityDefault: card.querySelector('[name="elasticityDefault"]')?.value
    });
  });
  const feeRules = {};
  form.querySelectorAll('[data-repricer-fee-card]').forEach((card) => {
    const platform = card.getAttribute('data-repricer-fee-card') || '';
    if (!platform) return;
    feeRules[platform] = normalizeRepricerFeeRule({
      commissionPct: card.querySelector('[name="commissionPct"]')?.value,
      logisticsRub: card.querySelector('[name="logisticsRub"]')?.value,
      storageRub: card.querySelector('[name="storageRub"]')?.value,
      adRub: card.querySelector('[name="adRub"]')?.value,
      returnsRub: card.querySelector('[name="returnsRub"]')?.value,
      otherRub: card.querySelector('[name="otherRub"]')?.value
    });
  });
  state.storage.repricerSettings = normalizeRepricerSettings({
    global: {
      minMarginPct: form.minMarginPct.value,
      defaultTargetDays: form.defaultTargetDays.value,
      launchTargetDays: form.launchTargetDays.value,
      oosDays: form.oosDays.value,
      alignmentEnabled: form.alignmentEnabled.checked,
      deadbandPct: form.deadbandPct.value,
      deadbandRub: form.deadbandRub.value
    },
    brandRules,
    statusRules,
    roleRules,
    feeRules
  });
  state.storage.repricerSettingsUpdatedAt = new Date().toISOString();
  persistRepricerState();
}

function saveRepricerSkuProfile(form) {
  const articleKey = form.getAttribute('data-article-key') || '';
  const next = normalizeRepricerSkuProfile({
    articleKey,
    status: form.status.value,
    role: form.role.value,
    launchReady: form.launchReady.value,
    updatedAt: new Date().toISOString(),
    updatedBy: state.team?.member?.name || 'Команда'
  });
  state.storage.repricerSkuProfiles = (state.storage.repricerSkuProfiles || []).filter((item) => item.articleKey !== articleKey);
  if (repricerHasSkuProfile(next)) {
    clearRepricerDeleteTombstone('repricerSkuProfileDeletes', articleKey, 'all', false);
    state.storage.repricerSkuProfiles.unshift(next);
  } else {
    markRepricerDeleteTombstone('repricerSkuProfileDeletes', articleKey, 'all', false);
  }
  persistRepricerState();
}

function resetRepricerSkuProfile(articleKey) {
  state.storage.repricerSkuProfiles = (state.storage.repricerSkuProfiles || []).filter((item) => item.articleKey !== articleKey);
  markRepricerDeleteTombstone('repricerSkuProfileDeletes', articleKey, 'all', false);
  persistRepricerState();
}

function saveRepricerCorridor(form) {
  const articleKey = form.getAttribute('data-article-key') || '';
  const platform = form.getAttribute('data-platform') || 'all';
  const next = normalizeRepricerCorridor({
    articleKey,
    platform,
    hardFloor: form.hardFloor.value,
    b2bFloor: form.b2bFloor.value,
    basePrice: form.basePrice.value,
    stretchCap: form.stretchCap.value,
    promoFloor: form.promoFloor.value,
    elasticity: form.elasticity.value,
    updatedAt: new Date().toISOString(),
    updatedBy: state.team?.member?.name || 'Команда'
  });
  state.storage.repricerCorridors = (state.storage.repricerCorridors || []).filter((item) => !(item.articleKey === articleKey && item.platform === platform));
  if (repricerHasCorridor(next)) {
    clearRepricerDeleteTombstone('repricerCorridorDeletes', articleKey, platform, true);
    state.storage.repricerCorridors.unshift(next);
  } else {
    markRepricerDeleteTombstone('repricerCorridorDeletes', articleKey, platform, true);
  }
  persistRepricerState();
}

function resetRepricerCorridor(articleKey, platform) {
  state.storage.repricerCorridors = (state.storage.repricerCorridors || []).filter((item) => !(item.articleKey === articleKey && item.platform === platform));
  markRepricerDeleteTombstone('repricerCorridorDeletes', articleKey, platform, true);
  persistRepricerState();
}

function upsertRepricerOverride(next) {
  const articleKey = String(next?.articleKey || '').trim();
  const platform = String(next?.platform || 'all').trim() || 'all';
  state.storage.repricerOverrides = (state.storage.repricerOverrides || []).filter((item) => !(item.articleKey === articleKey && item.platform === platform));
  if (repricerHasOverride(next)) {
    clearRepricerDeleteTombstone('repricerOverrideDeletes', articleKey, platform, true);
    state.storage.repricerOverrides.unshift(next);
  } else {
    markRepricerDeleteTombstone('repricerOverrideDeletes', articleKey, platform, true);
  }
  persistRepricerState();
}

function saveRepricerOverride(form) {
  const articleKey = form.getAttribute('data-article-key') || '';
  const platform = form.getAttribute('data-platform') || 'all';
  const next = normalizeRepricerOverride({
    articleKey,
    platform,
    mode: form.mode.value,
    floorPrice: form.floorPrice.value,
    capPrice: form.capPrice.value,
    forcePrice: form.forcePrice.value,
    promoActive: form.promoActive.checked,
    promoPrice: form.promoPrice.value,
    promoLabel: form.promoLabel.value,
    promoFrom: form.promoFrom.value,
    promoTo: form.promoTo.value,
    disableAlignment: form.disableAlignment.checked,
    note: form.note.value,
    updatedAt: new Date().toISOString(),
    updatedBy: state.team?.member?.name || 'Команда'
  });
  upsertRepricerOverride(next);
}

function resetRepricerOverride(articleKey, platform) {
  state.storage.repricerOverrides = (state.storage.repricerOverrides || []).filter((item) => !(item.articleKey === articleKey && item.platform === platform));
  markRepricerDeleteTombstone('repricerOverrideDeletes', articleKey, platform, true);
  persistRepricerState();
}

function applyRepricerPromoOffer(articleKey, platform) {
  const normalizedArticleKey = String(articleKey || '').trim();
  const normalizedPlatform = platform === 'ozon' ? 'ozon' : 'wb';
  const row = buildRepricerRows().find((item) => String(item?.articleKey || '').trim() === normalizedArticleKey);
  const side = row?.[normalizedPlatform];
  if (!side?.promoOfferConfigured || numberOrZero(side.promoOfferRequestedPrice) <= 0) {
    window.alert('Для этой площадки нет предложения акции.');
    return;
  }
  const currentOverride = side.override || {};
  const next = normalizeRepricerOverride({
    articleKey: normalizedArticleKey,
    platform: normalizedPlatform,
    mode: currentOverride.mode || 'auto',
    floorPrice: currentOverride.floorPrice,
    capPrice: currentOverride.capPrice,
    forcePrice: currentOverride.forcePrice,
    promoActive: true,
    promoPrice: side.promoOfferRequestedPrice,
    promoLabel: side.promoOfferLabel || `promo offer ${side.promoOfferSourceLabel || ''}`.trim(),
    promoFrom: side.promoOfferFrom,
    promoTo: side.promoOfferTo,
    disableAlignment: true,
    note: [currentOverride.note, side.promoOfferSourceLabel ? `promo offer: ${side.promoOfferSourceLabel}` : 'promo offer applied'].filter(Boolean).join(' · '),
    updatedAt: new Date().toISOString(),
    updatedBy: state.team?.member?.name || 'Команда'
  });
  upsertRepricerOverride(next);
}

function repricerExportNumber(value, digits = 0) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '';
  return Number(value).toFixed(digits).replace('.', ',');
}

function repricerCollectSides(rows, platform = 'all') {
  return rows.flatMap((row) => {
    const list = [];
    if ((platform === 'all' || platform === 'wb') && row.wb) list.push({ row, platform: 'wb', platformLabel: 'WB', side: row.wb });
    if ((platform === 'all' || platform === 'ozon') && row.ozon) list.push({ row, platform: 'ozon', platformLabel: 'Ozon', side: row.ozon });
    return list;
  });
}

function repricerTemplateAction(side) {
  return Math.abs(numberOrZero(side?.finalPrice) - numberOrZero(side?.currentPrice)) < 1 ? 'KEEP' : 'CHANGE';
}

function repricerHealthcheck(rows, platform = 'all') {
  const sideRows = repricerCollectSides(rows, platform);
  const activeSideRows = sideRows.filter(({ side }) => !side.outOfSpec);
  const smokeTests = repricerRunWorkbookSmokeTests(normalizeRepricerSettings(state.storage?.repricerSettings || {}));
  const metrics = {
    sku_count: rows.length,
    side_rows: sideRows.length,
    out_of_spec_rows: sideRows.filter(({ side }) => side.outOfSpec).length,
    blocked_gate: activeSideRows.filter(({ side }) => side.criticalGate === 'BLOCK').length,
    missing_current_price: activeSideRows.filter(({ side }) => numberOrZero(side.currentPrice) <= 0).length,
    missing_current_price_actionable: activeSideRows.filter(({ side }) => numberOrZero(side.currentPrice) <= 0 && !['LAUNCH_HOLD', 'OOS', 'OFF'].includes(String(side.reasonCode || ''))).length,
    missing_cost: activeSideRows.filter(({ side }) => numberOrZero(side.costRub) <= 0).length,
    protected_without_cost: activeSideRows.filter(({ side }) => !side.rawCostPresent && side.pricingProxyPresent && numberOrZero(side.effectiveFloor) > 0).length,
    missing_cost_actionable: activeSideRows.filter(({ side }) => numberOrZero(side.costRub) <= 0 && !side.pricingProxyPresent).length,
    missing_effective_floor: activeSideRows.filter(({ side }) => numberOrZero(side.effectiveFloor) <= 0).length,
    missing_effective_floor_actionable: activeSideRows.filter(({ side }) => numberOrZero(side.effectiveFloor) <= 0 && !['LAUNCH_HOLD', 'OFF'].includes(String(side.reasonCode || ''))).length,
    missing_status: activeSideRows.filter(({ side }) => !String(side.status || '').trim()).length,
    fallback_rows: activeSideRows.filter(({ side }) => side.economicFloorSource === 'snapshot_fallback').length,
    launch_hold_rows: activeSideRows.filter(({ side }) => side.launchHold === 'LAUNCH_HOLD').length,
    alignment_changed_rows: rows.filter((row) => row.alignmentChanged).length,
    smoke_passed: smokeTests.filter((item) => item.pass).length,
    smoke_total: smokeTests.length,
    promo_rows: activeSideRows.filter(({ side }) => side.promoActive).length,
    wb_change_rows: repricerCollectSides(rows, 'wb').filter(({ side }) => repricerTemplateAction(side) === 'CHANGE').length,
    ozon_change_rows: repricerCollectSides(rows, 'ozon').filter(({ side }) => repricerTemplateAction(side) === 'CHANGE').length
  };
  const issues = [];
  if (metrics.blocked_gate > 0) issues.push(`BLOCK gate: ${fmt.int(metrics.blocked_gate)}`);
  if (metrics.missing_current_price_actionable > 0) issues.push(`пустая текущая цена в активном контуре: ${fmt.int(metrics.missing_current_price_actionable)}`);
  if (metrics.missing_cost_actionable > 0) issues.push(`нет себестоимости без защитного proxy: ${fmt.int(metrics.missing_cost_actionable)}`);
  if (metrics.missing_effective_floor_actionable > 0) issues.push(`нет effective floor в активном контуре: ${fmt.int(metrics.missing_effective_floor_actionable)}`);
  if (metrics.missing_status > 0) issues.push(`не задан статус товара: ${fmt.int(metrics.missing_status)}`);
  if (metrics.fallback_rows > 0) issues.push(`economic fallback rows: ${fmt.int(metrics.fallback_rows)}`);
  if (metrics.smoke_passed < metrics.smoke_total) issues.push(`smoke tests: ${fmt.int(metrics.smoke_passed)}/${fmt.int(metrics.smoke_total)}`);
  return {
    metrics,
    smokeTests,
    issues,
    ok: issues.length === 0
  };
}

function repricerDownloadHtmlTable(columns, rows, filename) {
  if (!rows.length) return;
  const head = `<tr>${columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr>`;
  const body = rows.map((row) => `<tr>${columns.map(([key]) => `<td>${escapeHtml(row[key] || '')}</td>`).join('')}</tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1">${head}${body}</table></body></html>`;
  const blob = new Blob(['\uFEFF', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function repricerExportRows(platform = 'all') {
  return buildRepricerRows().flatMap((row) => {
    const sides = [];
    if ((platform === 'all' || platform === 'wb') && row.wb) sides.push(['WB', row.wb]);
    if ((platform === 'all' || platform === 'ozon') && row.ozon) sides.push(['Ozon', row.ozon]);
    return sides.map(([platformLabel, side]) => ({
      generated_at: state.smartPriceWorkbench?.generatedAt || '',
      marketplace: platformLabel,
      brand: row.brand || '',
      article_key: row.articleKey,
      article: row.article || row.articleKey,
      name: row.name || '',
      owner: row.owner || '',
      status: row.status || '',
      role: row.role || '',
      launch_ready: row.launchReady || '',
      segment: row.segment || '',
      abc: row.abc || '',
      mode: repricerModeLabel(side.mode),
      engine_mode: repricerModeLabel(side.engineMode),
      critical_gate: side.criticalGate || '',
      current_price_rub: repricerExportNumber(side.currentPrice),
      final_price_rub: repricerExportNumber(side.finalPrice),
      delta_rub: repricerExportNumber(side.changeRub),
      delta_pct: side.changePct == null ? '' : repricerExportNumber(side.changePct * 100, 1),
      hard_floor_rub: repricerExportNumber(side.hardFloor),
      b2b_floor_rub: repricerExportNumber(side.b2bFloor),
      economic_floor_rub: repricerExportNumber(side.economicFloor),
      economic_floor_fee_rub: repricerExportNumber(side.economicFloorByFee),
      economic_floor_fallback_rub: repricerExportNumber(side.economicFloorFallback),
      economic_floor_source: side.economicFloorSource || '',
      floor_source: side.floorSourceSummary || '',
      cost_rub: repricerExportNumber(side.costRub),
      fee_stack_rub: repricerExportNumber(side.feeStackRub),
      pre_align_price_rub: repricerExportNumber(side.preAlignPrice),
      capped_price_rub: repricerExportNumber(side.cappedPrice),
      reason_code: side.reasonCode || '',
      final_reason_code: side.finalReasonCode || side.reasonCode || '',
      floor_rub: repricerExportNumber(side.effectiveFloor),
      cap_rub: repricerExportNumber(side.capPrice),
      cap_source: side.capSourceSummary || '',
      stretch_cap_rub: repricerExportNumber(side.stretchCap),
        stretch_cap_source: side.stretchCapSourceSummary || '',
      managed_base_price_rub: repricerExportNumber(side.managedBasePrice),
      managed_base_source: side.baseSourceSummary || '',
      target_days: repricerExportNumber(side.targetDays),
      turnover_days: repricerExportNumber(side.turnoverDays, 1),
      turnover_source: side.turnoverSource || '',
      autoprice_allowed: side.autopriceAllowed ? 'yes' : 'no',
      launch_allowed: side.launchAllowed ? 'yes' : 'no',
      volume_push_allowed: side.volumePushAllowed ? 'yes' : 'no',
      stock_units: repricerExportNumber(side.stock),
      sku_min_price_rub: repricerExportNumber(side.skuMinPrice),
      sales_7d_units: repricerExportNumber(side.sales7d, 1),
      orders_daily_units: repricerExportNumber(side.ordersDaily, 1),
      inbound_units: repricerExportNumber(side.inboundUnits),
      lead_time_days: repricerExportNumber(side.leadTimeDays),
      alignment_eligible: side.eligibleAlignment ? 'yes' : 'no',
      alignment_delta_gate: side.deltaGate ? 'yes' : 'no',
      alignment_scenario: side.chosenScenario || '',
      alignment_keep_score: repricerExportNumber(side.keepScore, 0),
      alignment_follow_score: repricerExportNumber(side.followScore, 0),
      alignment_follow_price_rub: repricerExportNumber(side.followPrice),
      margin_pct: side.marginPct == null ? '' : repricerExportNumber(side.marginPct * 100, 1),
      required_margin_pct: side.requiredMarginPct == null ? '' : repricerExportNumber(side.requiredMarginPct * 100, 1),
      live_rec_price_rub: repricerExportNumber(side.liveReferencePrice),
      live_delta_rub: side.liveDeltaRub == null ? '' : repricerExportNumber(side.liveDeltaRub),
      live_delta_pct: side.liveDeltaPct == null ? '' : repricerExportNumber(side.liveDeltaPct * 100, 1),
      live_target_days: side.liveTargetDays == null ? '' : repricerExportNumber(side.liveTargetDays),
      live_strategy: side.liveStrategy || '',
      live_reason: side.liveReason || '',
      promo_active: side.promoActive ? 'yes' : 'no',
      promo_configured: side.promoConfigured ? 'yes' : 'no',
      promo_source: side.promoSource || '',
      promo_source_label: side.promoSourceLabel || '',
      promo_price_rub: side.promoActive ? repricerExportNumber(side.promoPrice) : '',
      promo_floor_rub: side.promoActive ? repricerExportNumber(side.promoFloor) : '',
      promo_floor_source: side.promoFloorSourceSummary || '',
      promo_label: side.promoLabel || '',
      promo_from: side.promoFrom || '',
      promo_to: side.promoTo || '',
      promo_window_status: side.promoWindowStatus || '',
      promo_offer_configured: side.promoOfferConfigured ? 'yes' : 'no',
      promo_offer_active: side.promoOfferActive ? 'yes' : 'no',
      promo_offer_price_rub: side.promoOfferConfigured ? repricerExportNumber(side.promoOfferRequestedPrice) : '',
      promo_offer_resolved_price_rub: side.promoOfferConfigured ? repricerExportNumber(side.promoOfferResolvedPrice) : '',
      promo_offer_source: side.promoOfferSourceLabel || '',
      floor_guard_applied: side.floorGuardApplied ? 'yes' : 'no',
      cap_guard_applied: side.capGuardApplied ? 'yes' : 'no',
      final_guard_floor_rub: repricerExportNumber(side.finalGuardFloor),
      final_guard_cap_rub: repricerExportNumber(side.finalGuardCap),
      alignment: side.alignmentApplied ? 'yes' : 'no',
      out_of_spec: side.outOfSpec ? 'yes' : 'no',
      raw_cost_present: side.rawCostPresent ? 'yes' : 'no',
      pricing_proxy_present: side.pricingProxyPresent ? 'yes' : 'no',
      has_override: side.hasOverride ? 'yes' : 'no',
      has_corridor: side.hasCorridor ? 'yes' : 'no',
      corridor_base_price_rub: side.corridor?.basePrice === '' || side.corridor?.basePrice == null ? '' : repricerExportNumber(side.corridor.basePrice),
      corridor_stretch_cap_rub: side.corridor?.stretchCap === '' || side.corridor?.stretchCap == null ? '' : repricerExportNumber(side.corridor.stretchCap),
      corridor_promo_floor_rub: side.corridor?.promoFloor === '' || side.corridor?.promoFloor == null ? '' : repricerExportNumber(side.corridor.promoFloor),
      floor_override_rub: side.override?.floorPrice === '' || side.override?.floorPrice == null ? '' : repricerExportNumber(side.override.floorPrice),
      cap_override_rub: side.override?.capPrice === '' || side.override?.capPrice == null ? '' : repricerExportNumber(side.override.capPrice),
      force_price_rub: side.override?.forcePrice === '' || side.override?.forcePrice == null ? '' : repricerExportNumber(side.override.forcePrice),
      disable_alignment: side.override?.disableAlignment ? 'yes' : 'no',
      override_note: side.override?.note || '',
      reason: side.reason || '',
      history_freshness_date: side.historyFreshnessDate || ''
    }));
  });
}

function downloadRepricerExcel(platform = 'all') {
  const rows = repricerExportRows(platform);
  if (!rows.length) return;
  const columns = [
    ['generated_at', 'Срез'],
    ['marketplace', 'Площадка'],
    ['brand', 'Бренд'],
    ['article_key', 'article_key'],
    ['article', 'Артикул'],
    ['name', 'Название'],
    ['owner', 'Owner'],
    ['status', 'Статус'],
    ['role', 'Роль'],
    ['launch_ready', 'Launch ready'],
    ['segment', 'Сегмент'],
    ['abc', 'ABC'],
    ['mode', 'Режим'],
    ['engine_mode', 'Engine режим'],
    ['critical_gate', 'Gate'],
    ['current_price_rub', 'Текущая цена, ₽'],
    ['final_price_rub', 'Финальная цена, ₽'],
    ['delta_rub', 'Δ, ₽'],
    ['delta_pct', 'Δ, %'],
    ['hard_floor_rub', 'Hard floor, ₽'],
    ['b2b_floor_rub', 'B2B floor, ₽'],
    ['economic_floor_rub', 'Economic floor, ₽'],
    ['economic_floor_fee_rub', 'Economic floor fee, ₽'],
    ['economic_floor_fallback_rub', 'Economic floor fallback, ₽'],
    ['economic_floor_source', 'Economic source'],
    ['cost_rub', 'Cost, ₽'],
    ['fee_stack_rub', 'Fee stack, ₽'],
    ['pre_align_price_rub', 'Pre-align, ₽'],
    ['capped_price_rub', 'Capped, ₽'],
    ['reason_code', 'Reason code'],
    ['final_reason_code', 'Final reason'],
    ['floor_rub', 'Floor, ₽'],
    ['cap_rub', 'Cap, ₽'],
    ['stretch_cap_rub', 'Stretch cap, ₽'],
    ['managed_base_price_rub', 'Managed base, ₽'],
    ['target_days', 'Цель, дн.'],
    ['turnover_days', 'Оборот, дн.'],
    ['turnover_source', 'Источник оборота'],
    ['autoprice_allowed', 'Autoprice'],
    ['launch_allowed', 'Launch rule'],
    ['volume_push_allowed', 'Volume push'],
    ['stock_units', 'Остаток, шт.'],
    ['sku_min_price_rub', 'SKU min, ₽'],
    ['sales_7d_units', 'Sales 7d, шт.'],
    ['orders_daily_units', 'Заказы, шт./день'],
    ['inbound_units', 'В пути, шт.'],
    ['lead_time_days', 'Lead time, дн.'],
    ['alignment_eligible', 'Align eligible'],
    ['alignment_delta_gate', 'Align delta gate'],
    ['alignment_scenario', 'Align scenario'],
    ['alignment_keep_score', 'Keep score'],
    ['alignment_follow_score', 'Follow score'],
    ['alignment_follow_price_rub', 'Follow price, ₽'],
    ['margin_pct', 'Маржа, %'],
    ['required_margin_pct', 'Порог маржи, %'],
    ['live_rec_price_rub', 'Live rec, ₽'],
    ['live_delta_rub', 'vs live, ₽'],
    ['live_delta_pct', 'vs live, %'],
    ['live_target_days', 'Live target, дн.'],
    ['live_strategy', 'Live strategy'],
    ['live_reason', 'Live reason'],
    ['promo_active', 'Promo'],
    ['promo_configured', 'Promo configured'],
    ['promo_source', 'Promo source'],
    ['promo_source_label', 'Promo source label'],
    ['promo_price_rub', 'Promo price, ₽'],
    ['promo_floor_rub', 'Promo floor, ₽'],
    ['promo_label', 'Promo label'],
    ['promo_from', 'Promo from'],
    ['promo_to', 'Promo to'],
    ['promo_window_status', 'Promo status'],
    ['promo_offer_configured', 'Promo offer configured'],
    ['promo_offer_active', 'Promo offer active'],
    ['promo_offer_price_rub', 'Promo offer price, ₽'],
    ['promo_offer_resolved_price_rub', 'Promo offer guarded, ₽'],
    ['promo_offer_source', 'Promo offer source'],
    ['alignment', 'Align'],
    ['out_of_spec', 'Out of spec'],
    ['raw_cost_present', 'Raw cost'],
    ['pricing_proxy_present', 'Pricing proxy'],
    ['has_override', 'Override'],
    ['has_corridor', 'Corridor'],
    ['corridor_base_price_rub', 'Corridor base, ₽'],
    ['corridor_stretch_cap_rub', 'Corridor stretch cap, ₽'],
    ['corridor_promo_floor_rub', 'Corridor promo floor, ₽'],
    ['floor_override_rub', 'Portal floor, ₽'],
    ['cap_override_rub', 'Portal cap, ₽'],
    ['force_price_rub', 'Force price, ₽'],
    ['disable_alignment', 'Без align'],
    ['override_note', 'Комментарий'],
    ['reason', 'Причина'],
    ['history_freshness_date', 'История до']
  ];
  repricerDownloadHtmlTable(columns, rows, `repricer-final-${platform}-${new Date().toISOString().slice(0, 10)}.xls`);
}

function repricerExportTemplateRows(platform, options = {}) {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const promoOnly = Boolean(options.promoOnly);
  const normalizedPlatform = platform === 'ozon' ? 'ozon' : 'wb';
  return repricerCollectSides(buildRepricerRows(), platform)
    .filter(({ side }) => !side.outOfSpec)
    .filter(({ side }) => promoOnly ? side.promoActive : !side.promoActive)
    .map(({ row, side }) => {
      const commentParts = [`portal repricer ${normalizedPlatform}`];
      if (side.promoActive) {
        commentParts.push(side.promoSource === 'promo_offer' ? 'PROMO_OFFER' : 'PROMO');
        if (side.promoSource === 'promo_offer' && side.promoSourceLabel) commentParts.push(side.promoSourceLabel);
        if (side.promoLabel) commentParts.push(side.promoLabel);
        if (side.promoFrom || side.promoTo) {
          commentParts.push(`окно ${side.promoFrom || '...'} - ${side.promoTo || '...'}`);
        }
      }
      return {
        sku_code: row.article || row.articleKey,
        final_price: repricerExportNumber(side.finalPrice),
        action: repricerTemplateAction(side),
        reason_code: side.finalReasonCode || side.reasonCode || '',
        load_ts: now,
        comment: commentParts.join(' · ')
      };
    });
}

function repricerTemplateColumns(platform) {
  const normalizedPlatform = platform === 'ozon' ? 'ozon' : 'wb';
  if (normalizedPlatform === 'ozon') {
    return [
      ['sku_code', 'Артикул'],
      ['final_price', 'Цена'],
      ['action', 'Действие'],
      ['reason_code', 'Причина'],
      ['load_ts', 'Срез'],
      ['comment', 'Комментарий']
    ];
  }
  return [
    ['sku_code', 'Артикул'],
    ['final_price', 'Цена'],
    ['action', 'Действие'],
    ['reason_code', 'Причина'],
    ['load_ts', 'Срез'],
    ['comment', 'Комментарий']
  ];
}

function downloadRepricerTemplateExcel(platform) {
  const normalizedPlatform = platform === 'ozon' ? 'ozon' : 'wb';
  const templateRows = repricerExportTemplateRows(normalizedPlatform);
  if (!templateRows.length) {
    window.alert(`В ${normalizedPlatform.toUpperCase()} сейчас нет строк для выгрузки.`);
    return;
  }
  const columns = repricerTemplateColumns(normalizedPlatform);
  repricerDownloadHtmlTable(columns, templateRows, `repricer-upload-${normalizedPlatform}-${new Date().toISOString().slice(0, 10)}.xls`);
}

function downloadRepricerPromoTemplateExcel(platform) {
  const normalizedPlatform = platform === 'ozon' ? 'ozon' : 'wb';
  const templateRows = repricerExportTemplateRows(normalizedPlatform, { promoOnly: true });
  if (!templateRows.length) {
    window.alert(`В ${normalizedPlatform.toUpperCase()} сейчас нет акционных строк.`);
    return;
  }
  const columns = repricerTemplateColumns(normalizedPlatform);
  repricerDownloadHtmlTable(columns, templateRows, `repricer-promo-upload-${normalizedPlatform}-${new Date().toISOString().slice(0, 10)}.xls`);
}

function attachRepricerEvents(root) {
  root.querySelector('#repricerSearchInput')?.addEventListener('input', (event) => {
    state.repricerFilters.search = event.target.value;
    renderRepricer();
  });
  root.querySelector('#repricerPlatformFilter')?.addEventListener('change', (event) => {
    state.repricerFilters.platform = event.target.value;
    renderRepricer();
  });
  root.querySelector('#repricerModeFilter')?.addEventListener('change', (event) => {
    state.repricerFilters.mode = event.target.value;
    renderRepricer();
  });
  root.querySelector('#repricerEconomicFilter')?.addEventListener('change', (event) => {
    state.repricerFilters.economicSource = event.target.value;
    renderRepricer();
  });
  root.querySelector('#repricerSettingsForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    saveRepricerSettings(event.currentTarget);
  });
  root.querySelector('[data-repricer-settings-reset]')?.addEventListener('click', () => {
    state.storage.repricerSettings = defaultRepricerSettings();
    state.storage.repricerSettingsUpdatedAt = new Date().toISOString();
    persistRepricerState();
  });
  root.querySelectorAll('.repricer-sku-form').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      saveRepricerSkuProfile(event.currentTarget);
    });
  });
  root.querySelectorAll('[data-repricer-sku-reset]').forEach((button) => {
    button.addEventListener('click', () => {
      resetRepricerSkuProfile(button.getAttribute('data-article-key') || '');
    });
  });
  root.querySelectorAll('.repricer-corridor-form').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      saveRepricerCorridor(event.currentTarget);
    });
  });
  root.querySelectorAll('[data-repricer-corridor-reset]').forEach((button) => {
    button.addEventListener('click', () => {
      resetRepricerCorridor(button.getAttribute('data-article-key') || '', button.getAttribute('data-platform') || 'all');
    });
  });
  root.querySelectorAll('.repricer-override-form').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      saveRepricerOverride(event.currentTarget);
    });
  });
  root.querySelectorAll('[data-repricer-reset]').forEach((button) => {
    button.addEventListener('click', () => {
      resetRepricerOverride(button.getAttribute('data-article-key') || '', button.getAttribute('data-platform') || 'all');
    });
  });
  root.querySelectorAll('[data-repricer-adopt-offer]').forEach((button) => {
    button.addEventListener('click', () => {
      applyRepricerPromoOffer(button.getAttribute('data-article-key') || '', button.getAttribute('data-platform') || 'wb');
    });
  });
  root.querySelectorAll('[data-repricer-export]').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.getAttribute('data-repricer-export') || 'all';
      if (mode === 'template:wb') {
        downloadRepricerTemplateExcel('wb');
        return;
      }
      if (mode === 'template:ozon') {
        downloadRepricerTemplateExcel('ozon');
        return;
      }
      if (mode === 'promo:wb') {
        downloadRepricerPromoTemplateExcel('wb');
        return;
      }
      if (mode === 'promo:ozon') {
        downloadRepricerPromoTemplateExcel('ozon');
        return;
      }
      downloadRepricerExcel(mode);
    });
  });
}

function renderRepricer() {
  const root = document.getElementById('view-repricer');
  if (!root) return;
  const sourceRows = buildRepricerRows();
  if (!sourceRows.length) {
    root.innerHTML = `<div class="card"><div class="head"><div><h3>Репрайсер</h3><div class="muted small">Контур пока не получил smart price workbench.</div></div>${badge('нет данных', 'warn')}</div><div class="muted" style="margin-top:10px">Нужно дождаться загрузки снапшота цен, после этого вкладка начнет считать рекомендации и хранить override прямо в портале.</div></div>`;
    return;
  }
  const rows = getFilteredRepricerRows();
  const settings = normalizeRepricerSettings(state.storage?.repricerSettings || {});
  const health = repricerHealthcheck(sourceRows);
  const smokeTests = health.smokeTests;
  const brandNames = [...new Set([...Object.keys(defaultRepricerSettings().brandRules || {}), ...Object.keys(settings.brandRules || {}), ...sourceRows.map((row) => row.brand).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'ru'));
  const statuses = [...new Set([...Object.keys(defaultRepricerSettings().statusRules), ...sourceRows.map((row) => row.status).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'ru'));
  const roles = [...new Set([...Object.keys(defaultRepricerSettings().roleRules), ...Object.keys(settings.roleRules || {}), ...sourceRows.map((row) => row.role).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'ru'));
  const feePlatforms = [...new Set([...Object.keys(defaultRepricerSettings().feeRules), ...Object.keys(settings.feeRules || {}), 'wb', 'ozon'])];
  const sideRows = sourceRows.flatMap((row) => [row.wb, row.ozon].filter(Boolean));
  const feeStackSides = sideRows.filter((side) => side.economicFloorSource === 'fee_stack').length;
  const mixedGuardSides = sideRows.filter((side) => side.economicFloorSource === 'snapshot_guard').length;
  const fallbackSides = sideRows.filter((side) => side.economicFloorSource === 'snapshot_fallback').length;
  const liveBenchmarkSides = sideRows.filter((side) => side.hasLiveBenchmark).length;
  const liveDriftSides = sideRows.filter((side) => side.liveDrift).length;
  const promoSides = sideRows.filter((side) => side.promoActive).length;
  const promoOfferSides = sideRows.filter((side) => side.promoOfferConfigured).length;
  const promoOfferActiveSides = sideRows.filter((side) => side.promoSource === 'promo_offer' && side.promoActive).length;
  const promoScheduledSides = sideRows.filter((side) => side.promoConfigured && side.promoWindowStatus === 'scheduled').length;
  const promoExpiredSides = sideRows.filter((side) => side.promoConfigured && side.promoWindowStatus === 'expired').length;
  const blockedGateSides = sideRows.filter((side) => side.criticalGate === 'BLOCK').length;
  const launchHoldSides = sideRows.filter((side) => side.launchHold === 'LAUNCH_HOLD').length;
  const alignmentEligibleRows = sourceRows.filter((row) => row.alignmentEligible).length;
  const alignmentChangedRows = sourceRows.filter((row) => row.alignmentChanged).length;
  const smokePassed = health.metrics.smoke_passed;
  const cards = [
    { label: 'SKU в контуре', value: sourceRows.length, hint: 'Все SKU, которые уже кормятся от smart price workbench.' },
    { label: 'Нужно менять цену', value: sourceRows.filter((row) => row.changed).length, hint: 'Есть разница между текущей и рекомендованной ценой.' },
    { label: 'SKU-профили', value: sourceRows.filter((row) => row.hasManagedProfile).length, hint: 'Статус, роль или launch-профиль уже правили на портале.' },
    { label: 'Коридоры MP', value: sideRows.filter((side) => side.hasCorridor).length, hint: 'По площадке уже задан отдельный ценовой коридор.' },
    { label: 'Ручные override', value: sourceRows.filter((row) => row.hasManualOverride).length, hint: 'Портал уже вмешался в базовый расчет.' },
    { label: 'Freeze / Hold / Force / Off', value: sideRows.filter((side) => ['freeze', 'hold', 'force', 'off'].includes(side.mode)).length, hint: 'Количество площадок с ручным или статусным блоком.' },
    { label: 'BLOCK gate', value: blockedGateSides, hint: 'Не хватает обязательных входов: цена, hard floor или cost.' },
    { label: 'Launch hold', value: launchHoldSides, hint: 'Новинки и перезапуски сдерживаются до READY.' },
    { label: 'Ниже floor', value: sideRows.filter((side) => side.belowFloorNow).length, hint: 'Текущая цена уже ниже рабочего порога.' },
    { label: 'Риск маржи', value: sideRows.filter((side) => side.marginRisk).length, hint: 'Маржа ниже рабочего порога.' },
    { label: 'Align eligible', value: alignmentEligibleRows, hint: 'SKU, где можно запускать scoring alignment WB/Ozon.' },
    { label: 'Aligned by score', value: alignmentChangedRows, hint: 'Сценарий follow победил keep по score-модели.' },
    { label: 'Smoke tests', value: `${fmt.int(smokePassed)}/${fmt.int(smokeTests.length)}`, hint: 'Базовые тест-кейсы: AUTO, LAUNCH, FREEZE, OOS, KEEP и PROMO_OFFER.' },
    { label: 'Fee stack ready', value: feeStackSides, hint: 'Площадки, где economic floor считается прямо из себестоимости и fee stack.' },
    { label: 'Mixed guard', value: mixedGuardSides, hint: 'Есть cost, но итоговый economic floor все еще держит snapshot guard.' },
    { label: 'Fallback', value: fallbackSides, hint: 'Пока считаем без cost, только по текущему smart-срезу.' },
    { label: 'Предложения акций', value: promoOfferSides, hint: 'Read-only promo offers из текущих слоев фактов, без новых таблиц.' },
    { label: 'Live benchmark', value: liveBenchmarkSides, hint: 'Площадки, где есть живая рекомендация текущего репрайсера.' },
    { label: 'Live drift > 3%', value: liveDriftSides, hint: 'Наш финал заметно расходится с живым repricer rec.' }
  ].map((card) => `<div class="card kpi control-card"><div class="label">${escapeHtml(card.label)}</div><div class="value">${typeof card.value === 'string' ? escapeHtml(card.value) : fmt.int(card.value)}</div><div class="hint">${escapeHtml(card.hint)}</div></div>`).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Репрайсер</h2>
        <p>Вкладка стала управляемым слоем портала: 05_ENGINE считаем из smart price workbench + SKU/Order facts, а затем отдельным шагом запускаем 06_ALIGNMENT по score-модели WB/Ozon.</p>
      </div>
      <div class="quick-actions">
        <button type="button" class="quick-chip" data-repricer-export="all">Audit Excel</button>
        <button type="button" class="quick-chip" data-repricer-export="template:wb">WB загрузка</button>
        <button type="button" class="quick-chip" data-repricer-export="template:ozon">Ozon загрузка</button>
        <button type="button" class="quick-chip" data-repricer-export="promo:wb">WB promo загрузка</button>
        <button type="button" class="quick-chip" data-repricer-export="promo:ozon">Ozon promo загрузка</button>
      </div>
    </div>

    <div class="badge-stack" style="margin-top:8px">${badge(`Источник ${state.smartPriceWorkbench?.generatedAt ? fmt.date(state.smartPriceWorkbench.generatedAt) : '—'}`, 'info')}${badge(state.smartPriceWorkbench?.liveEnrichmentUsed ? 'данные: smart_price_workbench + live enrich' : 'данные: smart_price_workbench', 'ok')}${state.smartPriceWorkbench?.liveEnrichmentAt ? badge(`live ${fmt.date(state.smartPriceWorkbench.liveEnrichmentAt)}`, 'info') : ''}${badge(hasRemoteStore() ? 'repricer controls в команде' : 'repricer controls локально', hasRemoteStore() ? 'ok' : 'info')}</div>

    <div class="badge-stack" style="margin-top:8px">${badge(`fee stack ${fmt.int(feeStackSides)}`, feeStackSides ? 'ok' : 'warn')}${badge(`mixed guard ${fmt.int(mixedGuardSides)}`, mixedGuardSides ? 'info' : '')}${badge(`fallback ${fmt.int(fallbackSides)}`, fallbackSides ? 'warn' : 'ok')}${badge(`promo active ${fmt.int(promoSides)}`, promoSides ? 'warn' : 'info')}${badge(`promo offers ${fmt.int(promoOfferSides)}`, promoOfferSides ? 'info' : '')}${badge(`offer active ${fmt.int(promoOfferActiveSides)}`, promoOfferActiveSides ? 'ok' : '')}${badge(`promo scheduled ${fmt.int(promoScheduledSides)}`, promoScheduledSides ? 'info' : '')}${badge(`promo expired ${fmt.int(promoExpiredSides)}`, promoExpiredSides ? 'warn' : '')}${badge(`align ${fmt.int(alignmentChangedRows)}`, alignmentChangedRows ? 'ok' : 'info')}${badge(`tests ${fmt.int(smokePassed)}/${fmt.int(smokeTests.length)}`, smokePassed === smokeTests.length ? 'ok' : 'warn')}${badge(`live ${fmt.int(liveBenchmarkSides)}`, liveBenchmarkSides ? 'info' : 'warn')}${badge(`live drift ${fmt.int(liveDriftSides)}`, liveDriftSides ? 'warn' : 'ok')}</div>

    <div class="grid cards">${cards}</div>

    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Healthcheck</h3>
          <p class="small muted">Минимальный контроль перед выгрузкой шаблонов WB/Ozon. Если здесь красное, шаблон лучше не отправлять без проверки.</p>
        </div>
        <div class="badge-stack">${health.ok ? badge('export ready', 'ok') : badge('needs review', 'warn')}</div>
      </div>
      <div class="badge-stack" style="margin-top:10px">
        ${badge(`block ${fmt.int(health.metrics.blocked_gate)}`, health.metrics.blocked_gate ? 'danger' : 'ok')}
        ${badge(`out of spec ${fmt.int(health.metrics.out_of_spec_rows)}`, health.metrics.out_of_spec_rows ? 'info' : '')}
        ${badge(`promo ${fmt.int(health.metrics.promo_rows)}`, health.metrics.promo_rows ? 'warn' : 'info')}
        ${badge(`no price ${fmt.int(health.metrics.missing_current_price)}`, health.metrics.missing_current_price ? 'warn' : 'ok')}
        ${badge(`active no price ${fmt.int(health.metrics.missing_current_price_actionable)}`, health.metrics.missing_current_price_actionable ? 'danger' : 'ok')}
        ${badge(`no cost ${fmt.int(health.metrics.missing_cost)}`, health.metrics.missing_cost ? 'warn' : 'ok')}
        ${badge(`protected ${fmt.int(health.metrics.protected_without_cost)}`, health.metrics.protected_without_cost ? 'info' : '')}
        ${badge(`fallback ${fmt.int(health.metrics.fallback_rows)}`, health.metrics.fallback_rows ? 'warn' : 'ok')}
        ${badge(`launch hold ${fmt.int(health.metrics.launch_hold_rows)}`, health.metrics.launch_hold_rows ? 'warn' : 'ok')}
      </div>
      ${health.issues.length ? `<div class="muted small" style="margin-top:8px">${escapeHtml(health.issues.join(' · '))}</div>` : ''}
      <details style="margin-top:10px">
        <summary class="small muted" style="cursor:pointer">Smoke tests</summary>
        <div class="stack" style="margin-top:10px">
          ${smokeTests.map((item) => `<div class="owner-cell"><strong>${escapeHtml(item.id)}</strong><div class="muted small">${badge(item.pass ? 'pass' : 'fail', item.pass ? 'ok' : 'danger')} expected ${escapeHtml(item.expectedMode)} / ${escapeHtml(item.expectedReason)} · actual ${escapeHtml(item.actualMode)} / ${escapeHtml(item.actualReason)}</div></div>`).join('')}
        </div>
      </details>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Управление моделью</h3>
          <p class="small muted">SKU profile задает статус/роль товара, corridor задает floor/base/cap по площадке, overrides нужны для ручных промо или фиксации цены.</p>
        </div>
        <div class="badge-stack">${badge(`brands ${fmt.int(brandNames.length)}`, 'info')}${badge(`statuses ${fmt.int(statuses.length)}`, 'info')}${badge(`roles ${fmt.int(roles.length)}`, 'info')}</div>
      </div>
      <form id="repricerSettingsForm" style="margin-top:10px">
        <div class="filters repricer-filters">
          <input type="number" step="0.1" min="0" name="minMarginPct" value="${escapeHtml(settings.global.minMarginPct)}" placeholder="Min margin, %">
          <input type="number" step="1" min="1" name="defaultTargetDays" value="${escapeHtml(settings.global.defaultTargetDays)}" placeholder="Default days">
          <input type="number" step="1" min="1" name="launchTargetDays" value="${escapeHtml(settings.global.launchTargetDays)}" placeholder="Launch days">
          <input type="number" step="1" min="0" name="oosDays" value="${escapeHtml(settings.global.oosDays)}" placeholder="OOS days">
          <input type="number" step="0.1" min="0" name="deadbandPct" value="${escapeHtml(settings.global.deadbandPct)}" placeholder="Deadband, %">
          <input type="number" step="1" min="0" name="deadbandRub" value="${escapeHtml(settings.global.deadbandRub)}" placeholder="Deadband, ₽">
        </div>
        <label class="muted small" style="display:flex; align-items:center; gap:8px; margin-top:8px">
          <input type="checkbox" name="alignmentEnabled" ${settings.global.alignmentEnabled ? 'checked' : ''}>
          Разрешить alignment WB/Ozon по score-модели
        </label>
        <div class="stack" style="margin-top:14px">
          <div class="muted small">Brand rules</div>
          ${brandNames.map((brand) => {
            const rule = normalizeRepricerBrandRule(settings.brandRules?.[brand] || {}, settings.global);
            return `<div class="owner-cell" data-repricer-brand-card="${escapeHtml(brand)}" style="display:grid; gap:10px"><div><strong>${escapeHtml(brand)}</strong><div class="muted small">Цель по оборачиваемости, порог OOS и маржа по бренду.</div></div><div class="filters repricer-filters"><input type="number" step="1" min="1" name="defaultTargetDays" value="${escapeHtml(rule.defaultTargetDays)}" placeholder="Default days"><input type="number" step="1" min="1" name="launchTargetDays" value="${escapeHtml(rule.launchTargetDays)}" placeholder="Launch days"><input type="number" step="1" min="0" name="oosDays" value="${escapeHtml(rule.oosDays)}" placeholder="OOS days"><input type="number" step="0.1" min="0" name="minMarginPct" value="${escapeHtml(rule.minMarginPct)}" placeholder="Min margin, %"></div><label class="muted small" style="display:flex; align-items:center; gap:8px"><input type="checkbox" name="alignmentEnabled" ${rule.alignmentEnabled ? 'checked' : ''}>Разрешить alignment</label></div>`;
          }).join('')}
        </div>
        <div class="stack" style="margin-top:14px">
          <div class="muted small">Status rules</div>
          ${statuses.map((status) => {
            const rule = normalizeRepricerStatusRule(settings.statusRules?.[status] || {});
            return `<div class="owner-cell" data-repricer-status-card="${escapeHtml(status)}" style="display:grid; gap:10px"><div><strong>${escapeHtml(status)}</strong><div class="muted small">Как статус влияет на auto / launch / alignment.</div></div><div class="filters repricer-filters"><select name="mode"><option value="auto" ${rule.mode === 'auto' ? 'selected' : ''}>Auto</option><option value="hold" ${rule.mode === 'hold' ? 'selected' : ''}>Hold</option><option value="launch" ${rule.mode === 'launch' ? 'selected' : ''}>Launch</option><option value="freeze" ${rule.mode === 'freeze' ? 'selected' : ''}>Freeze</option><option value="off" ${rule.mode === 'off' ? 'selected' : ''}>Off</option></select></div><div class="quick-actions"><label class="muted small"><input type="checkbox" name="allowAutoprice" ${rule.allowAutoprice ? 'checked' : ''}> Autoprice</label><label class="muted small"><input type="checkbox" name="allowLaunch" ${rule.allowLaunch ? 'checked' : ''}> Launch</label><label class="muted small"><input type="checkbox" name="allowAlignment" ${rule.allowAlignment ? 'checked' : ''}> Alignment</label></div></div>`;
          }).join('')}
        </div>
        <div class="stack" style="margin-top:14px">
          <div class="muted small">Role rules</div>
          ${roles.map((role) => {
            const rule = normalizeRepricerRoleRule(settings.roleRules?.[role] || {});
            return `<div class="owner-cell" data-repricer-role-card="${escapeHtml(role)}" style="display:grid; gap:10px"><div><strong>${escapeHtml(role)}</strong><div class="muted small">Target days, stretch и управление объемом.</div></div><div class="filters repricer-filters"><input type="number" step="1" min="1" name="targetDays" value="${escapeHtml(rule.targetDays)}" placeholder="Target days"><input type="number" step="0.1" min="0" name="minLiftPct" value="${escapeHtml(rule.minLiftPct)}" placeholder="Min lift, %"><input type="number" step="0.01" min="1" name="stretchMultiplier" value="${escapeHtml(rule.stretchMultiplier)}" placeholder="Stretch"><input type="number" step="0.1" name="elasticityDefault" value="${escapeHtml(rule.elasticityDefault)}" placeholder="Elasticity"></div><label class="muted small" style="display:flex; align-items:center; gap:8px"><input type="checkbox" name="allowVolumePush" ${rule.allowVolumePush ? 'checked' : ''}>Разрешить volume push при перегреве оборачиваемости</label></div>`;
          }).join('')}
        </div>
        <div class="stack" style="margin-top:14px">
          <div class="muted small">Fee stack по площадкам</div>
          ${feePlatforms.map((platform) => {
            const rule = normalizeRepricerFeeRule(settings.feeRules?.[platform] || {});
            return `<div class="owner-cell" data-repricer-fee-card="${escapeHtml(platform)}" style="display:grid; gap:10px"><div><strong>${escapeHtml(String(platform).toUpperCase())}</strong><div class="muted small">Используется для расчета economic floor, когда в источнике есть cost.</div></div><div class="filters repricer-filters"><input type="number" step="0.1" min="0" name="commissionPct" value="${escapeHtml(rule.commissionPct)}" placeholder="Комиссия, %"><input type="number" step="1" min="0" name="logisticsRub" value="${escapeHtml(rule.logisticsRub)}" placeholder="Логистика, ₽"><input type="number" step="1" min="0" name="storageRub" value="${escapeHtml(rule.storageRub)}" placeholder="Хранение, ₽"><input type="number" step="1" min="0" name="adRub" value="${escapeHtml(rule.adRub)}" placeholder="Реклама, ₽"><input type="number" step="1" min="0" name="returnsRub" value="${escapeHtml(rule.returnsRub)}" placeholder="Возвраты, ₽"><input type="number" step="1" min="0" name="otherRub" value="${escapeHtml(rule.otherRub)}" placeholder="Прочее, ₽"></div></div>`;
          }).join('')}
        </div>
        <div class="quick-actions" style="margin-top:14px">
          <button type="submit" class="quick-chip">Сохранить правила</button>
          <button type="button" class="quick-chip" data-repricer-settings-reset>Сбросить к базовым</button>
        </div>
      </form>
    </div>

    <div class="filters repricer-filters" style="margin-top:14px">
      <input id="repricerSearchInput" placeholder="Поиск по артикулу, названию, owner, причине…" value="${escapeHtml(state.repricerFilters.search)}">
      <select id="repricerPlatformFilter">
        <option value="all" ${state.repricerFilters.platform === 'all' ? 'selected' : ''}>WB + Ozon</option>
        <option value="wb" ${state.repricerFilters.platform === 'wb' ? 'selected' : ''}>Только WB</option>
        <option value="ozon" ${state.repricerFilters.platform === 'ozon' ? 'selected' : ''}>Только Ozon</option>
      </select>
      <select id="repricerModeFilter">
        <option value="changes" ${state.repricerFilters.mode === 'changes' ? 'selected' : ''}>Только с изменением цены</option>
        <option value="manual" ${state.repricerFilters.mode === 'manual' ? 'selected' : ''}>Только с override</option>
        <option value="promo" ${state.repricerFilters.mode === 'promo' ? 'selected' : ''}>Только promo</option>
        <option value="blocked" ${state.repricerFilters.mode === 'blocked' ? 'selected' : ''}>Freeze / Hold / Force</option>
        <option value="below_min" ${state.repricerFilters.mode === 'below_min' ? 'selected' : ''}>Ниже floor</option>
        <option value="margin_risk" ${state.repricerFilters.mode === 'margin_risk' ? 'selected' : ''}>Риск маржи</option>
        <option value="live_benchmark" ${state.repricerFilters.mode === 'live_benchmark' ? 'selected' : ''}>Есть live repricer</option>
        <option value="live_drift" ${state.repricerFilters.mode === 'live_drift' ? 'selected' : ''}>Наш финал != live &gt; 3%</option>
        <option value="all" ${state.repricerFilters.mode === 'all' ? 'selected' : ''}>Все SKU</option>
      </select>
      <select id="repricerEconomicFilter">
        <option value="all" ${state.repricerFilters.economicSource === 'all' ? 'selected' : ''}>Экономика: все</option>
        <option value="ready" ${state.repricerFilters.economicSource === 'ready' ? 'selected' : ''}>Только fee-ready</option>
        <option value="fee_stack" ${state.repricerFilters.economicSource === 'fee_stack' ? 'selected' : ''}>Только fee stack</option>
        <option value="snapshot_guard" ${state.repricerFilters.economicSource === 'snapshot_guard' ? 'selected' : ''}>Только mixed guard</option>
        <option value="snapshot_fallback" ${state.repricerFilters.economicSource === 'snapshot_fallback' ? 'selected' : ''}>Только fallback</option>
      </select>
    </div>

    <div class="repricer-stack">
      ${rows.map((row) => `<div class="card repricer-card"><div class="head"><div><strong>${linkToSku(row.articleKey, row.article || row.articleKey)}</strong><div class="muted small">${escapeHtml(row.name || 'Без названия')} · ${escapeHtml(row.owner || 'Без owner')}</div></div><div class="badge-stack">${row.brand ? badge(row.brand, 'info') : ''}${badge(row.status || '—')}${badge(`role ${row.role || '—'}`, 'info')}${badge(`launch ${row.launchReady || '—'}`, row.launchReady !== 'READY' ? 'warn' : 'ok')}${row.segment ? badge(row.segment, 'info') : ''}${row.abc ? badge(`ABC ${row.abc}`) : ''}${row.hasManagedProfile ? badge('sku rule', 'ok') : ''}${row.hasCorridor ? badge('corridor', 'info') : ''}${row.hasManualOverride ? badge('manual', 'warn') : ''}</div></div><details style="margin:10px 0"><summary class="small muted" style="cursor:pointer">Управлять SKU</summary><form class="repricer-sku-form" data-article-key="${escapeHtml(row.articleKey)}" style="margin-top:10px"><div class="filters repricer-filters"><select name="status">${statuses.map((status) => `<option value="${escapeHtml(status)}" ${row.status === status ? 'selected' : ''}>${escapeHtml(status)}</option>`).join('')}</select><select name="role">${roles.map((role) => `<option value="${escapeHtml(role)}" ${row.role === role ? 'selected' : ''}>${escapeHtml(role)}</option>`).join('')}</select><select name="launchReady"><option value="READY" ${row.launchReady === 'READY' ? 'selected' : ''}>READY</option><option value="HOLD" ${row.launchReady !== 'READY' ? 'selected' : ''}>HOLD</option></select></div><div class="quick-actions" style="margin-top:10px"><button type="submit" class="quick-chip">Сохранить SKU rule</button><button type="button" class="quick-chip" data-repricer-sku-reset data-article-key="${escapeHtml(row.articleKey)}">Сбросить SKU rule</button></div></form></details><div class="repricer-side-grid ${state.repricerFilters.platform !== 'all' ? 'single' : ''}">${state.repricerFilters.platform !== 'ozon' ? renderRepricerSide('WB', row.wb) : ''}${state.repricerFilters.platform !== 'wb' ? renderRepricerSide('Ozon', row.ozon) : ''}</div></div>`).join('') || '<div class="empty">По выбранным фильтрам repricer ничего не показал.</div>'}
    </div>
  `;

  attachRepricerEvents(root);
}
