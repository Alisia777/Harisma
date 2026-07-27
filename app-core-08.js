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

var numberOrZero = (typeof window !== 'undefined' && typeof window.numberOrZero === 'function')
  ? window.numberOrZero
  : function numberOrZeroFallback(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

if (typeof window !== 'undefined' && typeof window.numberOrZero !== 'function') {
  window.numberOrZero = numberOrZero;
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

function repricerFirstPositiveNumber(...values) {
  for (const value of values) {
    const parsed = numberOrZero(value);
    if (parsed > 0) return parsed;
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

function repricerLifecycleKey(value = '') {
  if (typeof normalizeProductLifecycleKey === 'function') return normalizeProductLifecycleKey(value);
  const raw = String(value || '').trim().toLowerCase().replaceAll('ё', 'е');
  if (!raw) return '';
  if (/новин|новый|launch|запуск/.test(raw)) return 'new';
  if (/перезапуск|relaunch|restart/.test(raw)) return 'relaunch';
  if (/наблюд|монитор|watch|monitor/.test(raw)) return 'watch';
  if (/вопрос|перераб|review|специф/.test(raw)) return 'question';
  if (/пауза|замороз|freeze|hold/.test(raw)) return 'paused';
  if (/вывед|archiv|removed/.test(raw)) return 'archived';
  if (/вывод|снимаем|снятие|exit|discontinu|sell.?out|clearance/.test(raw)) return 'exit';
  if (/актуал|active|работает|в работе/.test(raw)) return 'active';
  return '';
}

function repricerLifecycleMeta(key = '', fallbackLabel = '') {
  const normalizedKey = repricerLifecycleKey(key) || String(key || '').trim();
  const meta = window.PRODUCT_LIFECYCLE_STATUS_META?.[normalizedKey] || null;
  if (meta) return { key: normalizedKey, ...meta };
  const label = String(fallbackLabel || key || '').trim();
  return {
    key: label ? 'custom' : 'active',
    label: label || 'Актуальный',
    tone: label ? 'warn' : 'ok',
    repricerMode: label ? 'freeze' : 'auto',
    taskPolicy: label ? 'decision' : 'normal',
    description: label ? 'Пользовательский статус требует ручной проверки.' : ''
  };
}

function repricerProductLifecycleForRecord(record = {}, fallbackStatus = '', fallbackArticleKey = '') {
  const articleKey = String(record?.articleKey || record?.article || record?.sku || fallbackArticleKey || '').trim();
  let lifecycle = record?.productLifecycle && typeof record.productLifecycle === 'object'
    ? record.productLifecycle
    : null;

  if (!lifecycle && typeof productLifecycleForSku === 'function') {
    try {
      lifecycle = productLifecycleForSku({ ...record, articleKey }, articleKey);
    } catch (error) {
      console.warn('[repricer] product lifecycle', error);
    }
  }

  const rawKey = lifecycle?.key || lifecycle?.status || lifecycle?.label || fallbackStatus;
  const key = repricerLifecycleKey(rawKey) || (String(rawKey || '').trim() ? 'custom' : 'active');
  const meta = repricerLifecycleMeta(key, lifecycle?.label || lifecycle?.status || fallbackStatus);
  return {
    ...meta,
    ...lifecycle,
    key: lifecycle?.key ? (repricerLifecycleKey(lifecycle.key) || lifecycle.key) : meta.key,
    articleKey,
    label: lifecycle?.label || lifecycle?.status || meta.label,
    status: lifecycle?.status || lifecycle?.label || meta.label,
    repricerMode: lifecycle?.repricerMode || meta.repricerMode,
    taskPolicy: lifecycle?.taskPolicy || meta.taskPolicy,
    tone: lifecycle?.tone || meta.tone || '',
    source: lifecycle?.source || '',
    reason: lifecycle?.reason || lifecycle?.note || meta.description || ''
  };
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

function repricerLifecycleStatusRule(lifecycle, status, settings) {
  const fallback = repricerStatusRule(status, settings);
  const mode = String(lifecycle?.repricerMode || '').trim().toLowerCase();
  const key = String(lifecycle?.key || '').trim();
  const sourceLabel = lifecycle?.label || lifecycle?.status || status;
  const decorate = (rule) => ({
    ...normalizeRepricerStatusRule(rule),
    lifecycleKey: key,
    lifecycleLabel: sourceLabel,
    lifecycleSource: lifecycle?.source || '',
    lifecycleReason: lifecycle?.reason || lifecycle?.note || ''
  });

  if (!key || key === 'active' || mode === 'auto') return decorate(fallback);
  if (mode === 'launch') return decorate({ mode: 'launch', allowAutoprice: true, allowLaunch: true, allowAlignment: false });
  if (mode === 'freeze') return decorate({ mode: 'freeze', allowAutoprice: false, allowLaunch: false, allowAlignment: false });
  if (mode === 'hold') return decorate({ mode: 'hold', allowAutoprice: false, allowLaunch: false, allowAlignment: false });
  if (mode === 'off') return decorate({ mode: 'off', allowAutoprice: false, allowLaunch: false, allowAlignment: false });
  return decorate(fallback);
}

function productLifecycleBlocksAutoOrder(lifecycle) {
  return ['question', 'paused', 'exit', 'archived'].includes(String(lifecycle?.key || '').trim());
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
  const raw = repricerCanonicalBrandName(brand);
  const defaults = defaultRepricerSettings();
  if (!raw) return normalizeRepricerBrandRule({}, defaults.global);
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
  return Boolean(
    String(profile.status || '').trim()
    || String(profile.role || '').trim()
    || String(profile.launchReady || '').trim()
    || repricerMarginRatio(profile.targetMarginPct) > 0
  );
}

function repricerRequiredMarginGap(articleKey, platform) {
  const targetArticle = repricerNormalizeArticleKey(articleKey);
  const targetPlatform = String(platform || '').trim().toLowerCase();
  const rows = Array.isArray(state.repricerMarginMinMaxGaps?.rows)
    ? state.repricerMarginMinMaxGaps.rows
    : [];
  return rows.some((row) => (
    repricerNormalizeArticleKey(row?.articleKey || row?.article || row?.sku) === targetArticle
    && String(row?.platform || '').trim().toLowerCase() === targetPlatform
    && (Array.isArray(row?.missing) ? row.missing.includes('margin') : true)
  ));
}

function repricerRecordNotExpired(record) {
  const expiresAt = String(record?.expiresAt || record?.expires_at || '').trim();
  if (!expiresAt) return true;
  const stamp = Date.parse(expiresAt);
  return Number.isNaN(stamp) || stamp >= Date.now();
}

function repricerOverrideIsApprovedBusinessRecord(record) {
  if (!record || typeof record !== 'object') return false;
  const localDraftMarker = 'local_storage_draft_only';
  const status = String(record.approvalStatus || record.approval_status || record.status || '').trim().toLowerCase();
  const approved = !status || ['approved', 'active'].includes(status);
  const sourceStore = String(record.sourceStore || record.source_store || record.source || localDraftMarker).trim().toLowerCase();
  const serverBacked = Boolean(sourceStore && sourceStore !== localDraftMarker);
  const metadataComplete = Boolean(
    String(record.author || record.createdBy || record.created_by || '').trim()
    && String(record.role || record.authorRole || record.author_role || '').trim()
    && String(record.reason || record.note || '').trim()
    && String(record.createdAt || record.created_at || '').trim()
    && String(record.approvedBy || record.approved_by || '').trim()
    && String(record.approvedAt || record.approved_at || '').trim()
  );
  return approved && serverBacked && metadataComplete && repricerRecordNotExpired(record);
}

function repricerApprovedBusinessRecords(pool = []) {
  return (Array.isArray(pool) ? pool : []).filter(repricerOverrideIsApprovedBusinessRecord);
}

function repricerFindCorridor(articleKey, platform) {
  const pool = repricerApprovedBusinessRecords(state.storage?.repricerCorridors || []);
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
  const pool = repricerApprovedBusinessRecords(state.storage?.repricerOverrides || []);
  return pool.find((item) => item.articleKey === articleKey && item.platform === platform)
    || pool.find((item) => item.articleKey === articleKey && item.platform === 'all')
    || null;
}

function repricerNormalizeArticleKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-zа-я0-9]+/gi, '');
}

const REPRICER_LIVE_MAX_AGE_DAYS = 7;

function repricerLiveFreshnessStatus() {
  const rows = Array.isArray(state.repricerLive?.rows) ? state.repricerLive.rows : [];
  const liveStamp = repricerParseDateMs(state.repricerLive?.generatedAt || '');
  if (!rows.length || !liveStamp) return { usable: false, reason: 'missing' };
  const anchorStamp = Math.max(
    repricerParseDateMs(state.repricer?.generatedAt || ''),
    repricerParseDateMs(state.prices?.generatedAt || ''),
    repricerParseDateMs(state.smartPriceWorkbench?.generatedAt || ''),
    repricerParseDateMs(state.smartPriceOverlay?.generatedAt || '')
  );
  const ageDays = ((anchorStamp || Date.now()) - liveStamp) / 86400000;
  if (ageDays > REPRICER_LIVE_MAX_AGE_DAYS) {
    return { usable: false, reason: 'stale', ageDays };
  }
  return { usable: true, reason: 'fresh', ageDays };
}

function repricerLiveMap() {
  const freshness = repricerLiveFreshnessStatus();
  if (!freshness.usable) return new Map();
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

function repricerRowsFromBucket(rows) {
  if (Array.isArray(rows)) return rows;
  if (rows && typeof rows === 'object') return Object.values(rows);
  return [];
}

function repricerPricesMap(platform) {
  const platformBucket = state.prices?.platforms?.[platform] || {};
  let rows = repricerRowsFromBucket(platformBucket.rows);
  if (!rows.length) {
    rows = repricerRowsFromBucket(platformBucket.items || platformBucket.byArticle || platformBucket.articles);
  }
  if (!rows.length) {
    const platformKey = String(platform || '').trim().toLowerCase();
    rows = Object.entries(state.prices?.platforms || {}).flatMap(([bucketKey, bucket]) => {
      const bucketRows = repricerRowsFromBucket(bucket?.rows || bucket?.items || bucket?.byArticle || bucket?.articles);
      if (String(bucketKey || '').trim().toLowerCase() === platformKey) return bucketRows;
      return bucketRows.filter((row) => String(row?.platform || row?.marketplace || '').trim().toLowerCase() === platformKey);
    });
  }
  const map = new Map();
  rows.forEach((row) => {
    [
      row?.articleKey,
      row?.article,
      row?.sku,
      row?.offerId,
      row?.marketArticleId
    ].map((value) => repricerNormalizeArticleKey(value)).forEach((key) => {
      if (key && !map.has(key)) map.set(key, row);
    });
  });
  return map;
}

function repricerPayloadRows(payload) {
  if (!payload || typeof payload !== 'object') return [];
  return repricerRowsFromBucket(payload.rows || payload.items || payload.articles || payload.byArticle);
}

function repricerRowsWithLegacyFallback(platform, primaryRows = []) {
  const normalizedPlatform = platform === 'ozon' ? 'ozon' : 'wb';
  const rows = Array.isArray(primaryRows) ? [...primaryRows] : [];
  const seen = new Set(rows
    .map((row) => repricerNormalizeArticleKey(row?.articleKey || row?.article || row?.sku))
    .filter(Boolean));
  const legacyRows = Array.isArray(state.repricer?.rows) ? state.repricer.rows : [];
  legacyRows.forEach((legacyRow) => {
    const legacySide = legacyRow?.[normalizedPlatform];
    if (!legacySide || typeof legacySide !== 'object') return;
    const articleKey = legacySide.articleKey || legacyRow.articleKey || legacySide.article || legacyRow.article || '';
    const normalizedKey = repricerNormalizeArticleKey(articleKey);
    if (!normalizedKey || seen.has(normalizedKey)) return;
    seen.add(normalizedKey);
    rows.push({
      ...legacySide,
      marketplace: normalizedPlatform,
      articleKey,
      article: legacySide.article || legacyRow.article || articleKey,
      name: legacySide.name || legacyRow.name || '',
      brand: legacySide.brand || legacyRow.brand || '',
      owner: legacySide.owner || legacyRow.ownerByPlatform?.[normalizedPlatform] || legacyRow.owner || legacyRow.legalEntity || '',
      status: legacySide.status || legacyRow.status || legacyRow.productStatus || '',
      productStatus: legacySide.productStatus || legacyRow.productStatus || legacyRow.status || '',
      segment: legacySide.segment || legacyRow.segment || '',
      abc: legacySide.abc || legacyRow.abc || '',
      legalEntity: legacySide.legalEntity || legacyRow.legalEntity || '',
      legacyRepricerFallback: true
    });
  });
  return rows;
}

function repricerPlatformProcurementPayload(platform) {
  const normalized = String(platform || '').trim().toLowerCase() === 'ozon' ? 'ozon' : 'wb';
  if (normalized === 'ozon') {
    return state.orderProcurementOzon || state.orderProcurementOZON || state.order_procurement_ozon || null;
  }
  return state.orderProcurementWb || state.orderProcurementWB || state.order_procurement_wb || null;
}

function repricerCombinedProcurementRows(platform) {
  const normalized = String(platform || '').trim().toLowerCase() === 'ozon' ? 'ozon' : 'wb';
  const payload = state.orderProcurementCombined || state.orderProcurementSnapshot || state.order_procurement || null;
  return repricerPayloadRows(payload).filter((row) => {
    const raw = String(row?.platform || row?.marketplace || '').trim().toLowerCase();
    if (!raw) return false;
    return normalized === 'ozon' ? raw.includes('ozon') || raw.includes('озон') : raw === 'wb' || raw.includes('wild') || raw.includes('вб');
  });
}

function repricerBuildProcurementSignalMap(platform) {
  const platformRows = repricerPayloadRows(repricerPlatformProcurementPayload(platform));
  const rows = platformRows.length ? platformRows : repricerCombinedProcurementRows(platform);
  const map = new Map();
  rows.forEach((row) => {
    const key = repricerNormalizeArticleKey(row?.articleKey || row?.article || row?.sku || row?.offerId);
    if (!key) return;
    const current = map.get(key) || {
      inStock: 0,
      inTransit: 0,
      inRequest: 0,
      avgDaily: 0,
      sales7: 0,
      places: [],
      placesWithStock: 0
    };
    const inStock = numberOrZero(row?.inStock ?? row?.stock ?? row?.stockUnits);
    current.inStock += inStock;
    current.inTransit += numberOrZero(row?.inTransit ?? row?.stockInTransit);
    current.inRequest += numberOrZero(row?.inRequest ?? row?.stockInSupplyRequest);
    current.avgDaily += numberOrZero(row?.avgDaily ?? row?.ordersDaily);
    current.sales7 += numberOrZero(row?.sales7 ?? row?.orders7d);
    if (inStock > 0) current.placesWithStock += 1;
    const place = String(row?.place || row?.warehouse || row?.cluster || '').trim();
    if (place && !current.places.includes(place) && current.places.length < 4) current.places.push(place);
    map.set(key, current);
  });
  return map;
}

function repricerBuildWarehouseSignalMap() {
  const payload = state.warehouseStockOverlay || state.warehouse_stock_overlay || null;
  const map = new Map();
  repricerPayloadRows(payload).forEach((row) => {
    const key = repricerNormalizeArticleKey(row?.articleKey || row?.article || row?.sku);
    if (!key) return;
    const current = map.get(key) || {
      stockWarehouse: 0,
      accepted: 0,
      shippedWB: 0,
      shippedOzon: 0,
      updatedAt: ''
    };
    current.stockWarehouse += numberOrZero(row?.stockWarehouse);
    current.accepted += numberOrZero(row?.accepted);
    current.shippedWB += numberOrZero(row?.shippedWB);
    current.shippedOzon += numberOrZero(row?.shippedOzon);
    current.updatedAt = current.updatedAt || row?.updatedAt || row?.updated_at || '';
    map.set(key, current);
  });
  return map;
}

function repricerBuildArrivalPriceSignalMaps() {
  const warehouseMap = repricerBuildWarehouseSignalMap();
  const procurementMaps = {
    wb: repricerBuildProcurementSignalMap('wb'),
    ozon: repricerBuildProcurementSignalMap('ozon')
  };
  const maps = { wb: new Map(), ozon: new Map() };
  ['wb', 'ozon'].forEach((platform) => {
    const keys = new Set([...warehouseMap.keys(), ...procurementMaps[platform].keys()]);
    keys.forEach((key) => {
      const warehouse = warehouseMap.get(key) || {};
      const procurement = procurementMaps[platform].get(key) || {};
      const procurementSnapshotAvailable = procurementMaps[platform].size > 0;
      const procurementPresent = procurementMaps[platform].has(key);
      const shippedUnits = platform === 'ozon' ? numberOrZero(warehouse.shippedOzon) : numberOrZero(warehouse.shippedWB);
      const platformStock = numberOrZero(procurement.inStock);
      const inboundUnits = numberOrZero(procurement.inTransit) + numberOrZero(procurement.inRequest);
      const acceptedUnits = numberOrZero(warehouse.accepted);
      maps[platform].set(key, {
        articleKey: key,
        platform,
        procurementSnapshotAvailable,
        procurementPresent,
        platformStock,
        shippedUnits,
        inboundUnits,
        acceptedUnits,
        warehouseStock: numberOrZero(warehouse.stockWarehouse),
        placesWithStock: numberOrZero(procurement.placesWithStock),
        places: procurement.places || [],
        avgDaily: numberOrZero(procurement.avgDaily),
        sales7: numberOrZero(procurement.sales7),
        updatedAt: warehouse.updatedAt || ''
      });
    });
  });
  return maps;
}

function repricerArrivalStockLabel(signal = {}) {
  const parts = [];
  if (numberOrZero(signal.platformStock) > 0) parts.push(`на площадке ${fmt.int(signal.platformStock)}`);
  if (numberOrZero(signal.shippedUnits) > 0) parts.push(`отгружено ${fmt.int(signal.shippedUnits)}`);
  if (numberOrZero(signal.inboundUnits) > 0) parts.push(`в пути ${fmt.int(signal.inboundUnits)}`);
  return parts.join(' · ') || 'движения нет';
}

const REPRICER_DEFERRED_PRICING_REASONS = new Set(['LAUNCH_HOLD', 'OFF', 'OOS', 'NO_STOCK']);

function repricerDeferredPricingSide(side = {}) {
  const reasonCode = String(side?.reasonCode || '').toUpperCase();
  return REPRICER_DEFERRED_PRICING_REASONS.has(reasonCode)
    || String(side?.launchHold || '').toUpperCase() === 'LAUNCH_HOLD';
}

function repricerBuildArrivalPriceSignal(side, fact = {}) {
  const platformStock = numberOrZero(fact?.platformStock);
  const historicalShippedUnits = numberOrZero(fact?.shippedUnits);
  const shippedUnits = fact?.procurementSnapshotAvailable ? 0 : historicalShippedUnits;
  const inboundUnits = numberOrZero(fact?.inboundUnits);
  const hasMovement = platformStock > 0 || shippedUnits > 0 || inboundUnits > 0;
  const reasons = [];
  const priceAgeDays = repricerAgeDays(side?.currentPriceDate || side?.historyFreshnessDate);
  const currentPrice = numberOrZero(side?.currentPrice);
  const floor = numberOrZero(side?.effectiveFloor);
  const changed = Math.abs(numberOrZero(side?.changeRub)) >= 1;

  if (currentPrice <= 0 && !repricerDeferredPricingSide(side)) reasons.push('нет текущей цены');
  if (floor <= 0 && !repricerDeferredPricingSide(side)) reasons.push('нет рабочего MIN');
  if (repricerBelowMinNeedsManual(side)) reasons.push('ниже MIN вручную');
  if (side?.marginRisk) reasons.push('риск маржи');
  if (side?.criticalGate === 'BLOCK') reasons.push('стоп входов');
  if (side?.liveDrift) reasons.push('расходится с live');
  if (changed) reasons.push(`пересчитать цену ${fmt.money(currentPrice)} → ${fmt.money(side?.finalPrice)}`);
  if (priceAgeDays != null && priceAgeDays > 7) reasons.push(`цена старше ${fmt.int(Math.floor(priceAgeDays))} дн.`);
  if (side?.confidence === 'red') reasons.push('красная проверка');
  if (side?.confidence === 'yellow') reasons.push('жёлтая проверка');

  const needsCheck = hasMovement && reasons.length > 0;
  const tone = !hasMovement ? 'info' : (needsCheck ? (side?.confidence === 'red' || side?.criticalGate === 'BLOCK' ? 'danger' : 'warn') : 'ok');
  return {
    hasMovement,
    needsCheck,
    tone,
    platformStock,
    shippedUnits,
    historicalShippedUnits,
    inboundUnits,
    acceptedUnits: numberOrZero(fact?.acceptedUnits),
    warehouseStock: numberOrZero(fact?.warehouseStock),
    placesWithStock: numberOrZero(fact?.placesWithStock),
    places: fact?.places || [],
    avgDaily: numberOrZero(fact?.avgDaily),
    sales7: numberOrZero(fact?.sales7),
    priceAgeDays,
    reasons,
    label: needsCheck ? 'проверить цену' : (hasMovement ? 'цена без красных флагов' : 'нет прихода'),
    stockLabel: repricerArrivalStockLabel({ platformStock, shippedUnits, inboundUnits }),
    priorityScore: (needsCheck ? 100 : hasMovement ? 10 : 0)
      + (side?.confidence === 'red' ? 60 : side?.confidence === 'yellow' ? 30 : 0)
      + Math.min(40, Math.abs(numberOrZero(side?.changeRub)) / 100)
      + Math.min(30, (platformStock + shippedUnits + inboundUnits) / 100)
  };
}

function repricerLegacyMap() {
  const rows = Array.isArray(state.repricer?.rows) ? state.repricer.rows : [];
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

function repricerMarginAtPrice(price, discountFactor, commissionPct, internalAdvertisingPct, platformCostsRub, internalAdvertisingRub, costRub) {
  const fillPrice = numberOrZero(price);
  if (fillPrice <= 0) return 0;
  return fillPrice * numberOrZero(discountFactor) * (1 - numberOrZero(commissionPct) - numberOrZero(internalAdvertisingPct))
    - numberOrZero(platformCostsRub)
    - numberOrZero(internalAdvertisingRub)
    - numberOrZero(costRub);
}

function repricerMarginRatio(value) {
  const raw = numberOrZero(value);
  if (raw <= 0) return 0;
  if (raw > 1 && raw <= 100) return raw / 100;
  if (raw >= 1) return 0;
  return raw;
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

function repricerRecordHasKzTraffic(record) {
  if (!record || typeof record !== 'object') return false;
  const traffic = record.traffic && typeof record.traffic === 'object' ? record.traffic : {};
  const flags = record.flags && typeof record.flags === 'object' ? record.flags : {};
  const channels = Array.isArray(traffic.channels) ? traffic.channels : [];
  const rawText = [
    record.externalTraffic,
    record.trafficSignal,
    record.focusReasons,
    record.contentStatus,
    record.contentComment,
    ...channels
  ].filter(Boolean).join(' ').toLowerCase();
  return Boolean(traffic.kz || flags.hasKZ || rawText.includes('кз') || rawText.includes('content завод') || rawText.includes('контент завод'));
}

function repricerHasKzTraffic(...records) {
  return records.some((record) => repricerRecordHasKzTraffic(record));
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

function repricerParseDateMs(value) {
  if (!value) return 0;
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw;
  const stamp = Date.parse(normalized);
  return Number.isFinite(stamp) ? stamp : 0;
}

function repricerAgeDays(value) {
  const stamp = repricerParseDateMs(value);
  if (!stamp) return null;
  return (Date.now() - stamp) / 86400000;
}

const REPRICER_CURRENT_PRICE_MAX_AGE_DAYS = 2;
const REPRICER_SHARP_PRICE_APPROVAL_THRESHOLD_PCT = 0.10;

function repricerSidePriceDate(side = {}) {
  return side.currentPriceDate || side.historyFreshnessDate || side.sourceAsOf || '';
}

function repricerSharpPriceDecisionForSide(side = {}) {
  const articleKey = String(side.articleKey || '').trim();
  const platform = String(side.platform || 'all').trim().toLowerCase() || 'all';
  const finalPrice = Math.round(numberOrZero(side.finalPrice ?? side.recommendedPrice));
  if (!articleKey || finalPrice <= 0) return null;
  return (state.storage?.skuDecisionApprovals || []).find((item) => {
    if (String(item?.type || '').trim().toUpperCase() !== 'SHARP_PRICE_CHANGE') return false;
    if (String(item.articleKey || '').trim() !== articleKey) return false;
    const itemPlatform = String(item.platform || 'all').trim().toLowerCase() || 'all';
    if (itemPlatform !== platform && itemPlatform !== 'all' && platform !== 'all') return false;
    const requestedPrice = Math.round(numberOrZero(item.payload?.requestedPrice ?? item.proposedValue));
    return requestedPrice === finalPrice;
  }) || null;
}

function repricerSideHasApprovedSharpPrice(side = {}) {
  const override = side.override && typeof side.override === 'object' ? side.override : {};
  const approvalStatus = String(override.approvalStatus || override.approval_status || '').trim().toLowerCase();
  const approvedPrice = Math.round(numberOrZero(
    override.promoActive && numberOrZero(override.promoPrice) > 0
      ? override.promoPrice
      : override.forcePrice
  ));
  const finalPrice = Math.round(numberOrZero(side.finalPrice ?? side.recommendedPrice));
  return ['approved', 'active', 'verified'].includes(approvalStatus)
    && approvedPrice > 0
    && approvedPrice === finalPrice;
}

function repricerAddReason(list, reason) {
  const text = String(reason || '').trim();
  if (text && !list.includes(text)) list.push(text);
}

function repricerApplyStepLimit(side, roundedPrice, guardFloor, guardCap) {
  const currentPrice = numberOrZero(side?.currentPrice);
  let nextPrice = numberOrZero(roundedPrice);
  if (!side || currentPrice <= 0 || nextPrice <= 0 || side.promoActive || side.reasonCode === 'FORCE' || side.criticalGate === 'SKIP') {
    return nextPrice;
  }
  const delta = nextPrice - currentPrice;
  if (Math.abs(delta) < 1) return nextPrice;
  const marginRiskNow = side.marginPct != null && side.requiredMarginPct != null && numberOrZero(side.marginPct) + 0.0001 < numberOrZero(side.requiredMarginPct);
  const kzRaiseCapActive = Boolean(side.kzTrafficActive && delta > 0 && currentPrice > 0);
  const upLimitPct = Math.min(
    marginRiskNow || (guardFloor > 0 && currentPrice + 0.001 < guardFloor) ? 0.18 : 0.07,
    kzRaiseCapActive ? 0.10 : 1
  );
  const downLimitPct = 0.05;
  let limitPrice = nextPrice;
  if (delta > 0) {
    limitPrice = Math.ceil(currentPrice * (1 + upLimitPct));
    if (guardFloor > 0 && currentPrice + 0.001 < guardFloor) limitPrice = Math.max(limitPrice, guardFloor);
    if (nextPrice > limitPrice) {
      nextPrice = limitPrice;
      side.stepLimited = true;
      side.stepLimitPct = upLimitPct;
    }
  } else {
    limitPrice = Math.floor(currentPrice * (1 - downLimitPct));
    if (nextPrice < limitPrice) {
      nextPrice = limitPrice;
      side.stepLimited = true;
      side.stepLimitPct = downLimitPct;
    }
  }
  if (guardFloor > 0) nextPrice = Math.max(nextPrice, guardFloor);
  if (kzRaiseCapActive) {
    const kzLimitPrice = Math.ceil(currentPrice * 1.10);
    if (nextPrice > kzLimitPrice) {
      nextPrice = kzLimitPrice;
      side.stepLimited = true;
      side.stepLimitPct = Math.min(numberOrZero(side.stepLimitPct) || 1, 0.10);
      side.kzRaiseCapApplied = true;
      if (guardFloor > 0 && nextPrice + 0.001 < guardFloor) side.kzRaiseCapBelowFloor = true;
    }
  }
  if (guardCap > 0) nextPrice = Math.min(nextPrice, guardCap);
  if (side.stepLimited) {
    side.reason = [side.reason, `лимит шага ${Math.round(numberOrZero(side.stepLimitPct) * 100)}%`].filter(Boolean).join(' · ');
  }
  return nextPrice;
}

function repricerConfidenceLabel(level) {
  if (level === 'green') return 'зелёный';
  if (level === 'yellow') return 'аудит';
  if (level === 'red') return 'стоп';
  return 'нет оценки';
}

function repricerConfidenceTone(level) {
  if (level === 'green') return 'ok';
  if (level === 'yellow') return 'info';
  if (level === 'red') return 'danger';
  return '';
}

function repricerCanRaiseToMin(side) {
  if (!side || side.outOfSpec || side.promoActive) return false;
  if (side.criticalGate === 'SKIP' || side.criticalGate === 'BLOCK') return false;
  const currentPrice = numberOrZero(side.currentPrice);
  const floor = Math.ceil(Math.max(
    numberOrZero(side.effectiveFloor),
    numberOrZero(side.finalGuardFloor),
    numberOrZero(side.hardFloor),
    numberOrZero(side.b2bFloor),
    numberOrZero(side.skuMinPrice),
    numberOrZero(side.override?.floorPrice)
  ));
  const finalPrice = numberOrZero(side.finalPrice || side.recommendedPrice);
  if (currentPrice <= 0 || floor <= 0 || finalPrice <= 0) return false;
  if (currentPrice + 0.001 >= floor) return false;
  if (finalPrice + 0.001 < floor) return false;
  return finalPrice > currentPrice;
}

function repricerBelowMinNeedsManual(side) {
  return Boolean(side?.belowFloorNow && !side?.floorRaiseReady);
}

function repricerBuildDecisionText(side, reasons) {
  const finalPrice = numberOrZero(side?.finalPrice);
  const currentPrice = numberOrZero(side?.currentPrice);
  const deltaPct = currentPrice > 0 ? (finalPrice - currentPrice) / currentPrice : null;
  const reasonText = side?.floorRaiseReady && !reasons.length
    ? `текущая цена ниже MIN ${fmt.money(side?.effectiveFloor)}, поднимаем до порога`
    : reasons.length ? reasons.slice(0, 2).join(', ') : String(side?.reason || 'цена в рабочем коридоре').split(' · ')[0];
  if (side?.confidence === 'red') return `Не выгружать: ${reasonText}.`;
  if (side?.confidence === 'yellow') return `Совет с аудитом: ${reasonText}.`;
  if (Math.abs(finalPrice - currentPrice) < 1) return `Оставить ${fmt.money(currentPrice)}: цена в рабочем коридоре.`;
  const verb = finalPrice > currentPrice ? 'Поднять' : 'Снизить';
  const deltaText = deltaPct == null ? '' : `, ${deltaPct > 0 ? '+' : ''}${fmt.pct(deltaPct)}`;
  return `${verb} до ${fmt.money(finalPrice)}: ${reasonText}${deltaText}.`;
}

function repricerApplyConfidence(side) {
  if (!side) return side;
  const red = [];
  const yellow = [];
  const currentPrice = numberOrZero(side.currentPrice);
  const finalPrice = numberOrZero(side.finalPrice);
  const floor = numberOrZero(side.effectiveFloor);
  const floorRaiseReady = repricerCanRaiseToMin(side);
  side.floorRaiseReady = floorRaiseReady;
  const currentPriceDate = repricerSidePriceDate(side);
  const freshAge = window.__REPRICER_TEST_FORCE_CURRENT_PRICE_FRESH__
    ? 0
    : repricerAgeDays(currentPriceDate);
  const cooldownAge = repricerAgeDays(side.lastPriceChangeDate);
  const hasReliableCost = Boolean(side.rawCostPresent) || side.economicFloorSource === 'fee_stack' || side.economicFloorSource === 'snapshot_guard';
  const deltaPct = currentPrice > 0 && finalPrice > 0 ? (finalPrice - currentPrice) / currentPrice : null;
  const sharpDecision = repricerSharpPriceDecisionForSide(side);
  const sharpDecisionStatus = String(sharpDecision?.status || '').trim().toLowerCase();
  const sharpApprovalPending = ['preparing', 'waiting_rop', 'changes_requested'].includes(sharpDecisionStatus);
  const sharpApprovalApplied = sharpDecisionStatus === 'applied' || repricerSideHasApprovedSharpPrice(side);
  const sharpPriceApprovalRequired = deltaPct !== null
    && Math.abs(deltaPct) + 1e-9 >= REPRICER_SHARP_PRICE_APPROVAL_THRESHOLD_PCT
    && !sharpApprovalApplied;
  side.currentPriceFreshnessDate = currentPriceDate;
  side.currentPriceAgeDays = freshAge;
  side.currentPriceStale = freshAge !== null && freshAge > REPRICER_CURRENT_PRICE_MAX_AGE_DAYS;
  side.currentPriceFreshnessMissing = currentPrice > 0 && freshAge === null;
  side.sharpPriceApprovalRequired = sharpPriceApprovalRequired;
  side.sharpPriceApprovalPending = sharpApprovalPending;
  side.sharpPriceApprovalStatus = sharpApprovalApplied ? 'approved' : (sharpApprovalPending ? 'waiting_rop' : (sharpPriceApprovalRequired ? 'required' : 'not_required'));
  side.sharpPriceDecisionId = sharpDecision?.id || '';
  side.sharpPriceTaskId = sharpDecision?.taskId || '';

  if (side.outOfSpec || side.criticalGate === 'SKIP') repricerAddReason(red, 'строка вне спецификации');
  if (side.marginPolicyMissing) repricerAddReason(red, 'нет обязательной маржи SKU');
  if (side.criticalGate === 'BLOCK') repricerAddReason(red, 'нет обязательных входов');
  if (side.stockGateBlocksAutoprice) repricerAddReason(red, side.marketplaceUnavailable ? 'товар не продаётся или нет на складе' : 'нет актуального остатка и поставок');
  if (currentPrice <= 0) repricerAddReason(red, 'нет текущей цены');
  if (side.currentPriceFreshnessMissing) repricerAddReason(red, 'нет даты текущей цены');
  if (side.currentPriceStale) repricerAddReason(red, `текущая цена старше ${REPRICER_CURRENT_PRICE_MAX_AGE_DAYS} дней`);
  if (finalPrice <= 0) repricerAddReason(red, 'нет финальной цены');
  if (floor <= 0) repricerAddReason(red, 'нет рабочего MIN');
  if (floor > 0 && finalPrice > 0 && finalPrice + 0.001 < floor) repricerAddReason(red, 'финал ниже MIN');

  if (!hasReliableCost) repricerAddReason(yellow, 'себестоимость не подтверждена');
  if (side.economicFloorSource === 'snapshot_fallback') repricerAddReason(yellow, 'цена считается по fallback');
  if (side.belowFloorNow && !floorRaiseReady) repricerAddReason(yellow, 'текущая цена ниже MIN');
  if (side.marginRisk) repricerAddReason(yellow, 'маржа ниже порога');
  if (side.liveDrift) repricerAddReason(yellow, 'расходится с live-рекомендацией');
  if (side.launchHold === 'LAUNCH_HOLD') repricerAddReason(yellow, 'новинка не READY');
  if (side.stepLimited) repricerAddReason(yellow, 'сработал лимит шага цены');
  if (side.kzRaiseCapApplied) repricerAddReason(yellow, 'КЗ: рост цены ограничен 10%');
  if (side.promoConfigured && !side.promoActive) repricerAddReason(yellow, 'промо не активно сейчас');
  if (side.promoAdjustedToFloor || side.manualPromoAdjustedToFloor || side.promoOfferAdjustedToFloor) repricerAddReason(yellow, 'промо поднято до MIN');
  if (sharpPriceApprovalRequired) {
    repricerAddReason(yellow, sharpApprovalPending ? 'резкая цена ждёт РОПа' : 'резкая цена требует РОПа');
  }
  if (cooldownAge != null && cooldownAge >= 0 && cooldownAge < 3 && side.changed && !side.belowFloorNow && !side.marginRisk) {
    side.cooldownActive = true;
    repricerAddReason(yellow, `цена менялась ${fmt.num(cooldownAge, 1)} дн. назад`);
  } else {
    side.cooldownActive = false;
  }

  let score = 100;
  score -= red.length * 35;
  score -= yellow.length * 12;
  if (!side.changed) score -= 3;
  score = Math.max(0, Math.min(100, score));
  const level = red.length ? 'red' : (yellow.length ? 'yellow' : 'green');
  side.confidence = level;
  side.confidenceScore = score;
  side.confidenceReasons = [...red, ...yellow];
  side.sharpPriceAutoTaskEligible = sharpPriceApprovalRequired
    && !sharpApprovalPending
    && level !== 'red'
    && side.criticalGate !== 'BLOCK'
    && side.criticalGate !== 'SKIP';
  side.safeToExport = level !== 'red' && side.changed && !side.promoActive && !sharpPriceApprovalRequired;
  side.promoSafeToExport = level !== 'red' && side.changed && side.promoActive && !sharpPriceApprovalRequired;
  side.floorRaiseSafeToExport = Boolean(floorRaiseReady && side.safeToExport);
  side.decisionText = repricerBuildDecisionText(side, side.confidenceReasons);
  return side;
}

function repricerAppendSideReason(side, reason) {
  if (!side || !reason) return;
  const current = String(side.reason || '').trim();
  if (current.includes(reason)) return;
  side.reason = [current, reason].filter(Boolean).join(' · ');
}

function repricerGuardOutlierSide(side) {
  if (!side || typeof side !== 'object') return false;
  const current = numberOrZero(side.currentPrice);
  const finalPrice = numberOrZero(side.finalPrice ?? side.recommendedPrice);
  const hardFloor = Math.max(
    numberOrZero(side.hardFloor),
    numberOrZero(side.b2bFloor),
    numberOrZero(side.skuMinPrice),
    numberOrZero(side.override?.floorPrice)
  );
  const basis = Math.max(current, hardFloor, 1);
  const limit = Math.max(10000, basis * 5);
  const fallbackFloorOutlier = String(side.economicFloorSource || '') === 'snapshot_fallback'
    && numberOrZero(side.economicFloor) > limit
    && numberOrZero(side.economicFloorByFee) <= 0
    && !side.rawCostPresent;
  const finalPriceOutlier = finalPrice > limit && !side.promoActive && !side.hasOverride;
  if (!fallbackFloorOutlier && !finalPriceOutlier) return false;

  const safeFloor = hardFloor > 0 ? hardFloor : 0;
  const safePrice = Math.max(current, safeFloor);
  side.outlierGuarded = true;
  side.economicFloor = safeFloor;
  side.economicFloorFallback = Math.min(numberOrZero(side.economicFloorFallback), safeFloor || numberOrZero(side.economicFloorFallback));
  side.marginFloor = safeFloor;
  side.effectiveFloor = safeFloor;
  side.finalGuardFloor = safeFloor;
  side.finalGuardFloorRounded = safeFloor;
  side.recommendedPrice = safePrice;
  side.finalPrice = safePrice;
  side.preAlignPrice = Math.min(numberOrZero(side.preAlignPrice) || safePrice, safePrice);
  side.cappedPrice = Math.min(numberOrZero(side.cappedPrice) || safePrice, safePrice);
  side.changeRub = safePrice - current;
  side.changePct = current > 0 ? side.changeRub / current : null;
  side.changed = Math.abs(side.changeRub) >= 1;
  side.belowFloorNow = current > 0 && safeFloor > 0 && current + 0.001 < safeFloor;
  side.liveDeltaRub = numberOrZero(side.liveReferencePrice) > 0 ? safePrice - numberOrZero(side.liveReferencePrice) : null;
  side.liveDeltaPct = side.liveDeltaRub != null && numberOrZero(side.liveReferencePrice) > 0
    ? side.liveDeltaRub / numberOrZero(side.liveReferencePrice)
    : null;
  side.liveDrift = side.liveDeltaPct != null && Math.abs(side.liveDeltaPct) >= 0.03;
  side.alignmentApplied = false;
  side.finalReasonCode = 'GUARD_OUTLIER';
  repricerAppendSideReason(side, 'аномальный fallback-floor отключен');
  repricerApplyConfidence(side);
  return true;
}

function repricerApplyOutlierGuard(row) {
  const guarded = Boolean(repricerGuardOutlierSide(row?.wb) || repricerGuardOutlierSide(row?.ozon));
  if (!guarded || !row) return false;
  row.alignmentChanged = false;
  row.alignmentEligible = false;
  row.alignmentScenario = 'GUARD_OUTLIER';
  row.alignmentReason = 'fallback-floor guard';
  return true;
}

function repricerFinalizeSide(side) {
  if (!side) return null;
  if (side.stockGateBlocksAutoprice) {
    const holdPrice = numberOrZero(side.currentPrice);
    side.recommendedPrice = holdPrice;
    side.finalPrice = holdPrice;
    side.preAlignPrice = holdPrice;
    side.cappedPrice = holdPrice;
    side.changeRub = 0;
    side.changePct = holdPrice > 0 ? 0 : null;
    side.changed = false;
    side.belowFloorNow = false;
    side.marginRisk = side.marginPct != null && side.requiredMarginPct != null && numberOrZero(side.marginPct) + 0.0001 < numberOrZero(side.requiredMarginPct);
    side.lowStockRisk = false;
    side.hasLiveBenchmark = numberOrZero(side.liveReferencePrice) > 0;
    side.liveDeltaRub = side.hasLiveBenchmark ? holdPrice - numberOrZero(side.liveReferencePrice) : null;
    side.liveDeltaPct = side.hasLiveBenchmark && numberOrZero(side.liveReferencePrice) > 0
      ? side.liveDeltaRub / numberOrZero(side.liveReferencePrice)
      : null;
    side.liveDrift = side.liveDeltaPct != null && Math.abs(side.liveDeltaPct) >= 0.03;
    repricerApplyConfidence(side);
    side.arrivalPriceSignal = repricerBuildArrivalPriceSignal(side, side.arrivalFact || {});
    return side;
  }
  const rawPrice = numberOrZero(side.recommendedPrice);
  const guardFloor = Math.ceil(Math.max(
    numberOrZero(side.finalGuardFloor),
    numberOrZero(side.effectiveFloor),
    numberOrZero(side.hardFloor),
    numberOrZero(side.b2bFloor),
    numberOrZero(side.economicFloor),
    numberOrZero(side.skuMinPrice),
    numberOrZero(side.override?.floorPrice)
  ));
  const rawGuardCap = numberOrZero(side.finalGuardCap) > 0
    ? Math.floor(Math.max(numberOrZero(side.finalGuardCap), numberOrZero(side.effectiveFloor)))
    : 0;
  const guardCap = rawGuardCap > 0 ? Math.max(rawGuardCap, guardFloor) : 0;
  let roundedPrice = Math.round(rawPrice);
  if (guardFloor > 0) roundedPrice = Math.max(roundedPrice, guardFloor);
  if (guardCap > 0) roundedPrice = Math.min(roundedPrice, guardCap);
  roundedPrice = repricerApplyStepLimit(side, roundedPrice, guardFloor, guardCap);
  side.recommendedPrice = roundedPrice;
  side.finalPrice = roundedPrice;
  side.finalGuardFloorRounded = guardFloor > 0 ? guardFloor : 0;
  side.finalGuardCapRounded = guardCap > 0 ? guardCap : 0;
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
  repricerApplyConfidence(side);
  side.arrivalPriceSignal = repricerBuildArrivalPriceSignal(side, side.arrivalFact || {});
  return side;
}

function buildRepricerSide(sourceRow, platform, settings, context = {}) {
  if (!sourceRow) return null;
  const articleKey = sourceRow.articleKey || sourceRow.article || '';
  const override = repricerFindOverride(articleKey, platform);
  const corridor = repricerFindCorridor(articleKey, platform);
  const legacyRow = context.legacyRow && typeof context.legacyRow === 'object' ? context.legacyRow : null;
  const legacySide = context.legacySide && typeof context.legacySide === 'object' ? context.legacySide : null;
  const liveRow = context.liveRow && typeof context.liveRow === 'object' ? context.liveRow : null;
  const liveSide = liveRow && liveRow[platform] && typeof liveRow[platform] === 'object' ? liveRow[platform] : null;
  const skuFact = context.skuFact && typeof context.skuFact === 'object' ? context.skuFact : null;
  const skuSide = skuFact && skuFact[platform] && typeof skuFact[platform] === 'object' ? skuFact[platform] : null;
  const supportRow = context.supportRow && typeof context.supportRow === 'object' ? context.supportRow : null;
  const priceRow = context.priceRow && typeof context.priceRow === 'object' ? context.priceRow : null;
  const profile = context.profile && typeof context.profile === 'object' ? context.profile : null;
  const arrivalFact = context.arrivalFact && typeof context.arrivalFact === 'object' ? context.arrivalFact : {};
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
  const legacyPricingPresent = [
    legacySide?.currentPrice,
    legacySide?.minPrice,
    legacySide?.basePrice,
    legacySide?.workingZoneFrom,
    legacySide?.workingZoneTo,
    legacySide?.requiredPriceForProfitability,
    legacySide?.requiredPriceForMargin
  ].some(repricerHasValue);
  const brand = context.brand || sourceRow.brand || skuFact?.brand || '';
  const fallbackStatus = context.status || sourceRow.status || '';
  const productLifecycle = context.productLifecycle || repricerProductLifecycleForRecord({
    ...(skuFact || {}),
    articleKey,
    article: sourceRow.article || articleKey,
    productStatus: fallbackStatus || skuFact?.productStatus,
    status: fallbackStatus || skuFact?.status || sourceRow.status
  }, fallbackStatus, articleKey);
  const status = productLifecycle?.label || productLifecycle?.status || fallbackStatus;
  const sourceMode = String(sourceRow.sourceMode || '').trim();
  const clientOnlyMarketFacts = sourceMode === 'wb-market-facts-client-only';
  const role = context.role || repricerSuggestedRole(status, sourceRow.segment);
  const launchReady = normalizeRepricerLaunchReady(context.launchReady || repricerDefaultLaunchReady(status));
  const brandRule = repricerBrandRule(brand, settings);
  const statusRule = repricerLifecycleStatusRule(productLifecycle, status, settings);
  const roleRule = repricerRoleRule(role, settings);
  const feeRule = repricerFeeRule(platform, settings);
  const skuMinPrice = numberOrZero(skuSide?.minPrice);
  const skuBasePrice = repricerFirstFilledNumber(skuSide?.basePrice);
  const skuCapPrice = repricerFirstPositiveNumber(skuSide?.maxPrice, skuSide?.stretchCap);
  const sourceHasLiveCurrentPrice = String(sourceRow.currentSellerPriceSource || sourceRow.currentPriceSource || '').trim().toLowerCase() === 'live';
  const currentPricePresent = [sourceRow.currentFillPrice, sourceRow.currentPrice, priceRow?.currentPrice, supportRow?.currentExportPrice, skuSide?.currentPrice, legacySide?.currentPrice, liveSide?.currentPrice].some(repricerHasValue);
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
    legacySide?.minPrice,
    legacySide?.workingZoneFrom,
    legacySide?.requiredPriceForProfitability,
    liveSide?.minPrice
  ].some(repricerHasValue);
  const costPresent = [
    sourceRow.cost,
    sourceRow.costRub,
    liveRow?.cost,
    skuFact?.costPrice,
    legacyRow?.cost,
    legacyRow?.costRub,
    legacySide?.cost,
    legacySide?.costRub
  ].some(repricerHasValue);
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
                : (skuSide?.currentPrice != null
                  ? skuSide.currentPrice
                  : (legacySide?.currentPrice != null ? legacySide.currentPrice : liveSide?.currentPrice)))))))
  );
  const currentClientPrice = repricerFirstFilledNumber(
    priceRow?.currentClientPrice,
    clientOnlyMarketFacts ? null : sourceRow.currentClientPrice,
    clientOnlyMarketFacts ? null : sourceRow.buyerPrice,
    supportRow?.buyerCurrentExportMinPrice,
    skuSide?.buyerPrice,
    legacySide?.buyerPrice,
    legacySide?.currentClientPrice,
    liveSide?.buyerPrice
  );
  const seedTargetCandidate = [
    { source: 'smart_seed', value: sourceRow.seedTargetFillPrice, present: sourceRow.seedTargetFillPrice != null },
    { source: 'smart_base', value: sourceRow.basePrice, present: sourceRow.basePrice != null },
    { source: 'price_snapshot_base', value: priceRow?.basePrice, present: priceRow?.basePrice != null },
    { source: 'sku_base', value: skuBasePrice, present: skuBasePrice > 0 },
    { source: 'support_floor', value: supportRow?.workingZoneFrom, present: supportRow?.workingZoneFrom != null },
    { source: 'legacy_base', value: legacySide?.basePrice, present: legacySide?.basePrice != null },
    { source: 'legacy_rec', value: legacySide?.recPrice, present: legacySide?.recPrice != null },
    { source: 'live_base', value: liveSide?.basePrice, present: liveSide?.basePrice != null },
    { source: 'live_rec', value: liveSide?.recPrice, present: liveSide?.recPrice != null },
    { source: 'current_price', value: currentPrice, present: currentPrice > 0 }
  ].find((candidate) => candidate.present);
  const seedTargetSource = seedTargetCandidate?.source || '';
  const seedTargetPrice = numberOrZero(seedTargetCandidate?.value);
  const rawManagedBasePrice = repricerFirstFilledNumber(corridor?.basePrice, skuBasePrice, seedTargetPrice, legacySide?.basePrice, currentPrice);
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
  const legacyFloorCandidate = Math.max(
    numberOrZero(legacySide?.minPrice),
    numberOrZero(legacySide?.workingZoneFrom),
    numberOrZero(legacySide?.requiredPriceForProfitability)
  );
  const hardFloorCandidates = [
    { label: 'corridor_hard_floor', value: numberOrZero(corridor?.hardFloor) },
    { label: 'market_floor', value: sourceFloorCandidate },
    { label: 'support_floor', value: supportFloorCandidate },
    { label: 'price_snapshot_min', value: numberOrZero(priceRow?.minPrice) },
    { label: 'sku_min', value: skuMinPrice },
    { label: 'legacy_repricer_floor', value: legacyFloorCandidate },
    { label: 'live_min', value: numberOrZero(liveSide?.minPrice) }
  ];
  const sourceHardFloor = Math.max(sourceFloorCandidate, supportFloorCandidate, numberOrZero(priceRow?.minPrice), skuMinPrice, legacyFloorCandidate, numberOrZero(liveSide?.minPrice));
  const hardFloor = Math.max(sourceHardFloor, numberOrZero(corridor?.hardFloor));
  const hardFloorSourceSummary = repricerSourceSummary(hardFloorCandidates, hardFloor, hardFloor > 0 ? 'hard_floor' : '');
  const b2bFloor = numberOrZero(corridor?.b2bFloor);
  const costRub = Math.max(
    numberOrZero(sourceRow.cost),
    numberOrZero(sourceRow.costRub),
    numberOrZero(liveRow?.cost),
    numberOrZero(skuFact?.costPrice),
    numberOrZero(legacyRow?.cost),
    numberOrZero(legacyRow?.costRub),
    numberOrZero(legacySide?.cost),
    numberOrZero(legacySide?.costRub)
  );
  const profileTargetMarginPct = repricerMarginRatio(profile?.targetMarginPct);
  const liveMinMarginPct = repricerMarginRatio(liveSide?.marginNoAdsMinPct);
  const sourceAllowedMarginPct = repricerFirstPositiveNumber(
    repricerMarginRatio(sourceRow.manualMarginPct),
    repricerMarginRatio(sourceRow.targetMarginPct),
    repricerMarginRatio(sourceRow.allowedMarginPct)
  );
  const supportAllowedMarginPct = repricerFirstPositiveNumber(
    repricerMarginRatio(supportRow?.manualMarginPct),
    repricerMarginRatio(supportRow?.targetMarginPct),
    repricerMarginRatio(supportRow?.allowedMarginPct)
  );
  const priceAllowedMarginPct = repricerFirstPositiveNumber(
    repricerMarginRatio(priceRow?.manualMarginPct),
    repricerMarginRatio(priceRow?.targetMarginPct),
    repricerMarginRatio(priceRow?.allowedMarginPct)
  );
  const legacyAllowedMarginPct = repricerMarginRatio(legacySide?.allowedMarginPct || legacySide?.marginNoAdsMinPct);
  const perSkuMarginPct = repricerFirstPositiveNumber(
    profileTargetMarginPct,
    sourceAllowedMarginPct,
    supportAllowedMarginPct,
    priceAllowedMarginPct,
    legacyAllowedMarginPct,
    liveMinMarginPct
  );
  const marginLifecycleKey = repricerLifecycleKey(productLifecycle?.key || productLifecycle?.status || status);
  const requiredMarginGap = repricerRequiredMarginGap(articleKey, platform);
  const marginGuardRequired = requiredMarginGap || ['active', 'new', 'relaunch'].includes(marginLifecycleKey);
  const marginPolicyMissing = marginGuardRequired && (
    requiredMarginGap
    || !(perSkuMarginPct > 0 && perSkuMarginPct < 1)
  );
  const baseAllowedMarginPct = perSkuMarginPct;
  const requiredMarginPct = perSkuMarginPct > 0
    ? perSkuMarginPct
    : (marginGuardRequired ? 0 : numberOrZero(brandRule.minMarginPct) / 100);
  const marginPolicySource = profileTargetMarginPct > 0
    ? 'sku_profile'
    : (sourceAllowedMarginPct > 0
      ? 'smart_price_workbench'
      : (supportAllowedMarginPct > 0
        ? 'price_workbench_support'
        : (priceAllowedMarginPct > 0
          ? 'prices_snapshot'
          : (legacyAllowedMarginPct > 0
            ? 'legacy_repricer'
            : (liveMinMarginPct > 0
              ? 'live_repricer'
              : (marginPolicyMissing ? 'missing_required_sku_margin' : 'brand_fallback'))))));
  const requiredPriceForMargin = repricerFirstFilledNumber(sourceRow.requiredPriceForMargin, legacySide?.requiredPriceForMargin);
  const marginFloorMultiplier = baseAllowedMarginPct > 0
    ? Math.max(1, Math.min(requiredMarginPct / baseAllowedMarginPct, 3))
    : 1;
  const economicMarginFloor = requiredPriceForMargin > 0
    ? requiredPriceForMargin * marginFloorMultiplier
    : 0;
  const commissionPct = repricerMarginRatio(
    repricerFirstFilledNumber(
      sourceRow.commissionPct,
      sourceRow.commission_pct,
      feeRule.commissionPct
    )
  );
  const internalAdvertisingPct = repricerMarginRatio(
    repricerFirstFilledNumber(
      sourceRow.internalAdvertisingPct,
      sourceRow.internal_advertising_pct,
      sourceRow.adPct,
      feeRule.adPct
    )
  );
  const logisticsRubValue = repricerFirstFilledNumber(sourceRow.logisticsRub, feeRule.logisticsRub);
  const storageRubValue = repricerFirstFilledNumber(sourceRow.storageRub, feeRule.storageRub);
  const adRubValue = repricerFirstFilledNumber(sourceRow.adRub, feeRule.adRub);
  const returnsRubValue = repricerFirstFilledNumber(sourceRow.returnsRub, feeRule.returnsRub);
  const otherRubValue = repricerFirstFilledNumber(sourceRow.otherRub, feeRule.otherRub);
  const platformCostsRub = logisticsRubValue + storageRubValue + returnsRubValue + otherRubValue;
  const internalAdvertisingRub = adRubValue;
  const feeStackRub = platformCostsRub + internalAdvertisingRub;
  const economicFloorByFee = costRub > 0 && (1 - commissionPct - internalAdvertisingPct - requiredMarginPct) > 0
    ? Math.ceil((costRub + feeStackRub) / (1 - commissionPct - internalAdvertisingPct - requiredMarginPct))
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
    numberOrZero(legacySide?.minPrice),
    numberOrZero(legacySide?.workingZoneFrom),
    numberOrZero(legacySide?.requiredPriceForProfitability),
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
    { source: 'legacy_repricer', row: legacySide },
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
  const zoneFrom = Math.max(numberOrZero(sourceRow.workingZoneFrom), numberOrZero(legacySide?.workingZoneFrom), numberOrZero(corridor?.promoFloor), effectiveFloor);
  const stretchMultiplier = Math.max(1, numberOrZero(roleRule.stretchMultiplier) || 1);
  const derivedStretchCapBase = repricerFirstPositiveNumber(
    corridor?.basePrice,
    skuSide?.basePrice,
    sourceRow.basePrice,
    priceRow?.basePrice,
    legacySide?.basePrice,
    supportRow?.workingZoneFrom,
    currentPrice
  );
  const derivedStretchCap = derivedStretchCapBase > 0
    ? Math.round(Math.max(derivedStretchCapBase, derivedStretchCapBase * stretchMultiplier))
    : 0;
  const priceSnapshotCapCandidate = Math.max(numberOrZero(priceRow?.maxPrice), numberOrZero(priceRow?.workingZoneTo));
  const stretchCap = repricerFirstPositiveNumber(
    corridor?.stretchCap,
    skuSide?.maxPrice,
    skuSide?.stretchCap,
    sourceRow.workingZoneTo,
    supportRow?.workingZoneTo,
    supportRow?.maxPrice,
    legacySide?.workingZoneTo,
    legacySide?.upperCap,
    priceSnapshotCapCandidate,
    numberOrZero(liveSide?.maxPrice),
    derivedStretchCap
  );
  const manualCapPrice = numberOrZero(override?.capPrice);
  const capPrice = manualCapPrice > 0
    ? (stretchCap > 0 ? Math.min(manualCapPrice, stretchCap) : manualCapPrice)
    : Math.max(stretchCap, 0);
  const marginPriorityApplied = Boolean(
    marginGuardRequired
    && economicFloorByFee > 0
    && economicFloorByFee >= Math.max(hardFloor, b2bFloor)
  );
  const capLiftedByMargin = Boolean(
    marginGuardRequired
    && economicFloorByFee > 0
    && capPrice > 0
    && capPrice + 0.001 < economicFloorByFee
  );
  const managedBasePrice = capPrice > 0
    ? Math.min(rawManagedBasePrice, Math.max(capPrice, effectiveFloor))
    : rawManagedBasePrice;
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
          : (numberOrZero(supportRow?.maxPrice) > 0
            ? 'support_max_cap'
            : (numberOrZero(legacySide?.workingZoneTo) > 0 || numberOrZero(legacySide?.upperCap) > 0
              ? 'legacy_cap'
              : (priceSnapshotCapCandidate > 0
                ? 'price_snapshot_cap'
                : (numberOrZero(liveSide?.maxPrice) > 0 ? 'live_cap' : (derivedStretchCap > 0 ? 'role_derived_cap' : ''))))))));
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
  const targetDays = Math.max(1, numberOrZero(skuSide?.targetTurnoverDays) || numberOrZero(sourceRow.targetTurnoverDays) || numberOrZero(legacySide?.targetTurnoverDays) || numberOrZero(liveSide?.targetTurnoverDays) || numberOrZero(roleRule.targetDays) || (engineMode === 'launch'
    ? numberOrZero(brandRule.launchTargetDays)
    : numberOrZero(brandRule.defaultTargetDays)));
  const oosDays = numberOrZero(brandRule.oosDays);
  const procurementSnapshotAvailable = Boolean(arrivalFact.procurementSnapshotAvailable);
  const procurementPresent = Boolean(arrivalFact.procurementPresent);
  const procurementPlatformStock = numberOrZero(arrivalFact.platformStock);
  const procurementInboundUnits = numberOrZero(arrivalFact.inboundUnits);
  const skuInboundUnits = numberOrZero(skuSide?.stockInTransit) + numberOrZero(skuSide?.stockInSupplyRequest);
  const inboundUnits = procurementSnapshotAvailable ? procurementInboundUnits : skuInboundUnits;
  const stock = repricerFirstFilledNumber(
    procurementSnapshotAvailable ? procurementPlatformStock : null,
    platform === 'ozon' ? sourceRow.stockProducts : null,
    platform === 'ozon' ? skuSide?.stockProducts : null,
    sourceRow.stock,
    skuSide?.stock,
    sourceRow.stockRepricer,
    skuSide?.stockRepricer,
    legacySide?.stock,
    liveSide?.stock
  );
  const stockSource = procurementSnapshotAvailable
    ? (procurementPresent ? 'procurement_snapshot' : 'procurement_snapshot_absent')
    : (platform === 'ozon' && (repricerHasValue(sourceRow.stockProducts) || repricerHasValue(skuSide?.stockProducts))
      ? 'ozon_stock_products'
      : 'repricer_stock');
  const ordersDaily = numberOrZero(skuFact?.orders?.units) / 27;
  const leadTimeDays = numberOrZero(skuFact?.leadTimeDays);
  const marketplaceStatusText = [
    sourceRow.productStatus,
    sourceRow.statusDescription,
    supportRow?.productStatus,
    supportRow?.statusDescription,
    priceRow?.productStatus,
    priceRow?.statusDescription,
    legacySide?.productStatus,
    legacySide?.statusDescription,
    skuSide?.productStatus,
    skuSide?.statusDescription
  ].filter(Boolean).join(' ').toLowerCase();
  const marketplaceUnavailable = /не\s*прода|убран|нет\s+на\s+складе|архив|снят\s+с\s+продаж/.test(marketplaceStatusText);
  const noCurrentPlatformSupply = procurementSnapshotAvailable && stock <= 0 && inboundUnits <= 0;
  const stockGateBlocksAutoprice = modeCode !== 'FORCE' && (noCurrentPlatformSupply || marketplaceUnavailable);
  const kzTrafficActive = repricerHasKzTraffic(sourceRow, skuFact, supportRow, priceRow, legacyRow, legacySide);
  let turnoverSource = sourceRow.turnoverCurrentDays != null
    ? 'workbench'
    : (skuSide?.turnoverDays != null ? 'order' : (legacySide?.turnoverDays != null ? 'legacy' : (liveSide?.turnoverDays != null ? 'live' : '')));
  let turnoverDays = numberOrZero(
    sourceRow.turnoverCurrentDays != null
      ? sourceRow.turnoverCurrentDays
      : (skuSide?.turnoverDays != null ? skuSide.turnoverDays : (legacySide?.turnoverDays != null ? legacySide.turnoverDays : liveSide?.turnoverDays))
  );
  if (turnoverDays <= 0 && stock > 0 && ordersDaily > 0) {
    turnoverDays = stock / ordersDaily;
    turnoverSource = 'derived_orders';
  }
  const sales7d = Math.max(repricerRecentUnits7d(sourceRow), ordersDaily * 7);
  const commissionPctValue = commissionPct;
  const internalAdvertisingPctValue = internalAdvertisingPct;
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
    && !legacyPricingPresent
    && !currentPricePresent
    && !pricingProxyPresent
    && numberOrZero(stock) <= 0;
  let criticalGate = outOfSpec ? 'SKIP' : ((!currentPricePresent || !pricingProxyPresent) ? 'BLOCK' : 'OK');
  let launchHold = '';
  let oosFlag = '';
  let turnoverAction = 'KEEP';
  let reasonCode = 'KEEP';

  if (productLifecycle?.key && productLifecycle.key !== 'active') {
    reasons.push(`статус товара: ${productLifecycle.label || productLifecycle.status || productLifecycle.key}`);
  }
  if (promoActive && !outOfSpec && pricingProxyPresent) {
    criticalGate = 'OK';
    if (!currentPricePresent) reasons.push(promoSource === 'promo_offer' ? 'promo offer без текущей цены' : 'promo override без текущей цены');
  }
  if (marginPolicyMissing && !outOfSpec) {
    criticalGate = 'BLOCK';
    reasons.push('нет обязательной маржи SKU');
  }

  if (!String(status || '').trim()) reasons.push('status not set');
  if (modeCode === 'LAUNCH' && launchReady !== 'READY') {
    launchHold = 'LAUNCH_HOLD';
    reasons.push(`launch_ready = ${launchReady || 'HOLD'}`);
  }
  if (modeCode === 'AUTO' && !autopriceAllowed) reasons.push('autoprice disabled by status');
  if (modeCode === 'LAUNCH' && !launchAllowed) reasons.push('launch disabled by status');
  if (stockGateBlocksAutoprice) {
    criticalGate = 'BLOCK';
    if (marketplaceUnavailable) reasons.push('площадка не продаёт товар / нет на складе');
    if (noCurrentPlatformSupply) reasons.push(procurementPresent ? 'нет актуального остатка и поставок' : 'SKU отсутствует в актуальном отчёте остатков/поставок');
  }
  if (stock <= 0) {
    oosFlag = 'OOS';
    reasons.push('stock_total <= 0');
  } else if (turnoverDays > 0 && oosDays > 0 && turnoverDays <= oosDays) {
    oosFlag = 'LOW_STOCK';
    reasons.push(`покрытие ${fmt.num(turnoverDays, 1)} дн. <= ${fmt.int(oosDays)} дн.`);
  }

  if (marginPolicyMissing) {
    turnoverAction = 'BLOCK';
  } else if (modeCode === 'FORCE') {
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

  if (stockGateBlocksAutoprice) {
    preAlignPrice = currentPrice || 0;
    cappedPrice = currentPrice || 0;
    recommendedPrice = currentPrice || 0;
    turnoverAction = 'NO_STOCK';
    reasonCode = 'NO_STOCK';
    strategy = 'NO_STOCK';
  }

  if (modeCode === 'FORCE' && !marginPolicyMissing) {
    recommendedPrice = repricerClamp(numberOrZero(override?.forcePrice) || currentPrice || managedBasePrice || effectiveFloor, effectiveFloor, capPrice || (numberOrZero(override?.forcePrice) || currentPrice || managedBasePrice || effectiveFloor));
    preAlignPrice = recommendedPrice;
    cappedPrice = recommendedPrice;
    reasonCode = 'FORCE';
    strategy = 'FORCE';
    reasons.length = 0;
    reasons.push(`ручная цена ${fmt.money(recommendedPrice)}`);
  }

  if (promoActive && criticalGate !== 'SKIP' && !marginPolicyMissing) {
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
    productLifecycle,
    productLifecycleKey: productLifecycle?.key || 'active',
    productLifecycleLabel: productLifecycle?.label || productLifecycle?.status || status,
    productLifecycleTone: productLifecycle?.tone || '',
    productLifecycleSource: productLifecycle?.source || '',
    productLifecycleReason: productLifecycle?.reason || productLifecycle?.note || '',
    productLifecycleTaskPolicy: productLifecycle?.taskPolicy || '',
    role,
    launchReady,
    currentPrice,
      currentClientPrice,
      sourceMode,
      recommendedPrice,
      arrivalFact,
    preAlignPrice,
    cappedPrice,
    reasonCode,
    hardFloor,
    b2bFloor,
    costRub,
    feeRule,
    platformCostsRub,
    internalAdvertisingRub,
    feeStackRub,
    economicFloorByFee,
    economicFloorFallback,
    economicFloor,
    economicFloorSource,
    economicFloorSourceLabel,
    effectiveFloor,
    floorSourceSummary: effectiveFloorSourceSummary,
    stretchCap,
    stretchCapSourceSummary,
    capPrice,
    capSourceSummary,
    basePrice: repricerFirstFilledNumber(sourceRow.basePrice, priceRow?.basePrice, legacySide?.basePrice),
    managedBasePrice,
    baseSourceSummary: managedBaseSourceSummary,
    targetPrice: managedBasePrice,
    turnoverDays,
    turnoverSource,
    targetDays,
    oosDays,
    stock,
    stockSource,
    platformStock: procurementPlatformStock,
    procurementSnapshotAvailable,
    procurementPresent,
    noCurrentPlatformSupply,
    marketplaceUnavailable,
    stockGateBlocksAutoprice,
    sales7d,
    skuMinPrice,
    ordersDaily,
    inboundUnits,
    leadTimeDays,
    kzTrafficActive,
    buyerDiscountFactor,
    commissionPctValue,
    internalAdvertisingPctValue,
    logisticsRubValue,
    storageRubValue,
    adRubValue,
    returnsRubValue,
    otherRubValue,
    marginPct: sourceRow.marginTotalPct == null
      ? (legacySide?.marginPct == null
        ? (liveSide?.marginPct == null ? null : numberOrZero(liveSide.marginPct))
        : numberOrZero(legacySide.marginPct))
      : numberOrZero(sourceRow.marginTotalPct),
    requiredMarginPct,
    marginPolicySource,
    perSkuMarginPct,
    marginGuardRequired,
    marginPolicyMissing,
    marginPriorityApplied,
    capLiftedByMargin,
    minMaxFloor: hardFloor,
    minMaxCap: capPrice,
    marginFloor: marginGuardRequired ? economicFloorByFee : 0,
    strategy,
    reason: reasons.join(' · ') || sourceRow.seedReason || 'Без пояснения',
    currentPriceDate: sourceRow.currentPriceDate || priceRow?.currentPriceDate || supportRow?.currentPriceDate || legacySide?.currentPriceDate || liveSide?.currentPriceDate || '',
    lastPriceChangeDate: sourceRow.lastPriceChangeDate || sourceRow.priceChangedAt || sourceRow.currentPriceChangedAt || priceRow?.lastPriceChangeDate || priceRow?.priceChangedAt || supportRow?.lastPriceChangeDate || skuSide?.lastPriceChangeDate || legacySide?.lastPriceChangeDate || legacySide?.priceChangedAt || liveSide?.lastPriceChangeDate || '',
    historyFreshnessDate: sourceRow.historyFreshnessDate || priceRow?.historyFreshnessDate || priceRow?.currentPriceDate || legacySide?.historyFreshnessDate || legacySide?.currentPriceDate || liveSide?.historyFreshnessDate || '',
    historyNote: sourceRow.historyNote || '',
    mode,
    modeCode,
    engineMode,
    engineModeCode,
    criticalGate,
    outOfSpec,
    pricingProxyPresent,
    legacyPricingPresent,
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
    liveReferencePrice: repricerFirstFilledNumber(liveSide?.recPrice, legacySide?.liveRecPrice),
    liveTargetDays: repricerFirstFilledNumber(liveSide?.targetTurnoverDays, legacySide?.targetTurnoverDays),
    liveStrategy: liveSide?.strategy || legacySide?.liveStrategy || '',
    liveReason: liveSide?.reason || legacySide?.liveReason || '',
    liveBuyerPrice: repricerFirstFilledNumber(liveSide?.buyerPrice, legacySide?.buyerPrice),
    liveMarginPct: liveSide?.marginPct == null ? (legacySide?.marginPct == null ? null : numberOrZero(legacySide.marginPct)) : numberOrZero(liveSide.marginPct),
    liveMarginNoAdsMinPct: liveSide?.marginNoAdsMinPct == null ? (legacySide?.marginNoAdsMinPct == null ? null : numberOrZero(legacySide.marginNoAdsMinPct)) : numberOrZero(liveSide.marginNoAdsMinPct)
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
  const wbKeepMargin = repricerMarginAtPrice(wbKeepPrice, wb.buyerDiscountFactor, wb.commissionPctValue, wb.internalAdvertisingPctValue, wb.platformCostsRub, wb.internalAdvertisingRub, wb.costRub);
  const wbFollowMargin = repricerMarginAtPrice(wbFollowOzonPrice, wb.buyerDiscountFactor, wb.commissionPctValue, wb.internalAdvertisingPctValue, wb.platformCostsRub, wb.internalAdvertisingRub, wb.costRub);
  const ozKeepMargin = repricerMarginAtPrice(ozKeepPrice, oz.buyerDiscountFactor, oz.commissionPctValue, oz.internalAdvertisingPctValue, oz.platformCostsRub, oz.internalAdvertisingRub, oz.costRub);
  const ozFollowMargin = repricerMarginAtPrice(ozFollowWbPrice, oz.buyerDiscountFactor, oz.commissionPctValue, oz.internalAdvertisingPctValue, oz.platformCostsRub, oz.internalAdvertisingRub, oz.costRub);
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
      allowedMarginPct: 0.25,
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

const REPRICER_ROWS_CACHE = {
  signature: '',
  rows: [],
  builtAt: 0
};

function repricerCacheListSignature(items = [], fields = []) {
  const list = Array.isArray(items) ? items : [];
  const sample = list.slice(0, 30).map((item) => fields.map((field) => String(item?.[field] ?? '')).join(':')).join('|');
  return `${list.length}:${sample}`;
}

function repricerRowsCacheSignature() {
  const workbench = state.smartPriceWorkbench || {};
  const platforms = workbench.platforms || {};
  const support = state.priceWorkbenchSupport || state.price_workbench_support || {};
  const supportPlatforms = support.platforms || {};
  const storage = state.storage || {};
  return [
    workbench.generatedAt || '',
    workbench.liveEnrichmentAt || '',
    Array.isArray(platforms?.wb?.rows) ? platforms.wb.rows.length : 0,
    Array.isArray(platforms?.ozon?.rows) ? platforms.ozon.rows.length : 0,
    support.generatedAt || '',
    Array.isArray(supportPlatforms?.wb?.rows)
      ? supportPlatforms.wb.rows.length
      : Object.keys(supportPlatforms?.wb?.rows || {}).length,
    Array.isArray(supportPlatforms?.ozon?.rows)
      ? supportPlatforms.ozon.rows.length
      : Object.keys(supportPlatforms?.ozon?.rows || {}).length,
    state.canonicalRepricer?.snapshot_id || '',
    state.canonicalRepricer?.generatedAt || '',
    state.canonicalRepricer?.summary?.feature_status || state.canonicalRepricer?.feature_status || '',
    Array.isArray(state.canonicalRepricer?.rows) ? state.canonicalRepricer.rows.length : 0,
    state.repricerShadowReport?.generatedAt || '',
    state.repricerShadowReport?.cutover_allowed === true ? 'canonical-active' : 'legacy-shadow',
    state.repricerShadowReport?.summary?.canonical_ready_rows || 0,
    state.repricerShadowReport?.summary?.price_agreement || 0,
    state.repricerMarginMinMaxGaps?.generatedAt || '',
    state.repricerMarginMinMaxGaps?.summary?.blockedRows || 0,
    (state.portalRuntimeWiring?.artifacts || []).map((artifact) => `${artifact.id}:${artifact.checksum || ''}`).join(','),
    state.portalFeatureReadiness?.features?.repricer?.status || '',
    state.repricer?.generatedAt || '',
    Array.isArray(state.repricer?.rows) ? state.repricer.rows.length : 0,
    state.repricerLive?.generatedAt || '',
    repricerLiveFreshnessStatus().usable ? 'live-ok' : 'live-stale',
    Array.isArray(state.repricerLive?.rows) ? state.repricerLive.rows.length : 0,
    state.prices?.generatedAt || '',
    state.warehouseStockOverlay?.generatedAt || state.warehouse_stock_overlay?.generatedAt || '',
    state.orderProcurementWb?.generatedAt || state.order_procurement_wb?.generatedAt || '',
    state.orderProcurementOzon?.generatedAt || state.order_procurement_ozon?.generatedAt || '',
    storage.repricerSettingsUpdatedAt || '',
    JSON.stringify(storage.repricerSettings || {}),
    repricerCacheListSignature(storage.repricerOverrides, ['articleKey', 'platform', 'mode', 'floorPrice', 'capPrice', 'forcePrice', 'promoActive', 'promoPrice', 'updatedAt']),
    repricerCacheListSignature(storage.repricerCorridors, ['articleKey', 'platform', 'hardFloor', 'basePrice', 'stretchCap', 'promoFloor', 'updatedAt']),
    repricerCacheListSignature(storage.repricerSkuProfiles, ['articleKey', 'status', 'role', 'launchReady', 'updatedAt']),
    repricerCacheListSignature(storage.skuDecisionApprovals, ['articleKey', 'platform', 'type', 'status', 'proposedValue', 'updatedAt'])
  ].join('||');
}

function invalidateRepricerRowsCache() {
  REPRICER_ROWS_CACHE.signature = '';
  REPRICER_ROWS_CACHE.rows = [];
  REPRICER_ROWS_CACHE.builtAt = 0;
}

function repricerRowsCacheHasMissingContour(rows = []) {
  if (!Array.isArray(rows)) return false;
  return rows.some((row) => ['wb', 'ozon'].some((platform) => {
    const side = row?.[platform];
    if (!side || side.outOfSpec) return false;
    const deferredPricing = typeof repricerDeferredPricingSide === 'function'
      ? repricerDeferredPricingSide(side)
      : false;
    const missingMin = numberOrZero(side.effectiveFloor) <= 0 && !deferredPricing;
    const missingCost = numberOrZero(side.costRub) <= 0 && !side.pricingProxyPresent && !deferredPricing;
    return missingMin || missingCost;
  }));
}

function repricerOutOfScopeBrandLabel(value) {
  const compact = String(value || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
  if (!compact) return '';
  if (compact.includes('qeep')) return 'QEEP';
  if (compact.includes('zarli')) return 'Zarli';
  if (compact.includes('harly') || compact.includes('harley') || compact.includes('харли')) return 'HArly';
  return '';
}

function repricerOutOfScopeBrandForRows(...rows) {
  const fields = ['brand', 'brandName', 'vendor', 'manufacturer', 'articleKey', 'article', 'name'];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const field of fields) {
      const label = repricerOutOfScopeBrandLabel(row[field]);
      if (label) return label;
    }
  }
  return '';
}

function buildRepricerRows(forceFresh = false) {
  const signature = repricerRowsCacheSignature();
  if (!forceFresh && REPRICER_ROWS_CACHE.signature === signature && Array.isArray(REPRICER_ROWS_CACHE.rows)) {
    if (!repricerRowsCacheHasMissingContour(REPRICER_ROWS_CACHE.rows)) {
      return REPRICER_ROWS_CACHE.rows;
    }
  }
  const rows = buildRepricerRowsFresh();
  REPRICER_ROWS_CACHE.signature = signature;
  REPRICER_ROWS_CACHE.rows = rows;
  REPRICER_ROWS_CACHE.builtAt = Date.now();
  return rows;
}

function canonicalRepricerRowsAvailable() {
  const canonical = state.canonicalRepricer || {};
  const summary = canonical.summary || {};
  const featureStatus = String(summary.feature_status || canonical.feature_status || '').trim().toLowerCase();
  const rowCount = Array.isArray(canonical.rows) ? canonical.rows.length : 0;
  const eligibleRows = Number(summary.eligible_rows ?? canonical.eligible_rows);
  const generatedStamp = Date.parse(String(canonical.generatedAt || ''));
  const legacyStamp = Date.parse(String(state.repricer?.generatedAt || ''));
  const explicitlyBlocked = ['blocked', 'off', 'disabled', 'maintenance'].includes(featureStatus);
  const coherentRowCount = !Number.isFinite(eligibleRows) || eligibleRows <= 0 || eligibleRows === rowCount;
  const notOlderThanLegacy = !Number.isFinite(legacyStamp)
    || !Number.isFinite(generatedStamp)
    || generatedStamp >= legacyStamp;
  return canonical.schema === 'canonical-repricer-v1'
    && rowCount > 0
    && !explicitlyBlocked
    && coherentRowCount
    && notOlderThanLegacy;
}

function canonicalRepricerCutoverAllowed() {
  const shadow = state.repricerShadowReport || {};
  return shadow.schema === 'repricer-shadow-report-v1' && shadow.cutover_allowed === true;
}

function canonicalRepricerMarginAtPrice(price, economics = {}) {
  const value = numberOrZero(price);
  if (value <= 0) return null;
  const fixedCosts = economics.fixed_costs_per_unit == null
    ? numberOrZero(economics.logistics_per_unit)
    : numberOrZero(economics.fixed_costs_per_unit);
  const net = value
    - value * numberOrZero(economics.commission_pct)
    - value * numberOrZero(economics.internal_advertising_pct)
    - value * numberOrZero(economics.tax_pct)
    - fixedCosts
    - numberOrZero(economics.cost);
  return Math.round((net / value) * 1000000) / 1000000;
}

function canonicalRepricerRuntimeSide(canonical = {}) {
  const facts = canonical.facts || {};
  const economics = canonical.economics || {};
  const economicsComponents = economics.components || {};
  const policy = canonical.policy || {};
  const recommendation = canonical.recommendation || {};
  const price = facts.seller_price == null ? null : numberOrZero(facts.seller_price);
  const canonicalProposedPrice = recommendation.price == null ? null : numberOrZero(recommendation.price);
  const canonicalReady = recommendation.status === 'ready' && canonicalProposedPrice != null;
  const floor = policy.floor == null ? 0 : numberOrZero(policy.floor);
  const cap = policy.cap == null ? 0 : numberOrZero(policy.cap);
  const approvedOverride = canonicalReady
    ? repricerFindOverride(canonical.article_key, canonical.platform)
    : null;
  const approvedRequestedPrice = approvedOverride
    ? numberOrZero(
      approvedOverride.promoActive && numberOrZero(approvedOverride.promoPrice) > 0
        ? approvedOverride.promoPrice
        : approvedOverride.forcePrice
    )
    : 0;
  let approvedOverrideGuard = '';
  let proposedPrice = canonicalProposedPrice;
  if (approvedRequestedPrice > 0) {
    let guardedPrice = approvedRequestedPrice;
    if (floor > 0 && guardedPrice < floor) {
      guardedPrice = floor;
      approvedOverrideGuard = policy.margin_floor != null
        && numberOrZero(policy.margin_floor) >= numberOrZero(policy.min_max_floor)
        ? 'margin_floor'
        : 'min_floor';
    }
    if (cap > 0 && cap >= floor && guardedPrice > cap) {
      guardedPrice = cap;
      approvedOverrideGuard = 'max_cap';
    }
    proposedPrice = approvedOverrideGuard === 'margin_floor' || approvedOverrideGuard === 'min_floor'
      ? Math.ceil(guardedPrice)
      : (approvedOverrideGuard === 'max_cap' ? Math.floor(guardedPrice) : Math.round(guardedPrice));
  }
  const finalPrice = proposedPrice == null ? price : proposedPrice;
  const approvedOverrideApplied = canonicalReady && approvedRequestedPrice > 0;
  const ready = canonicalReady && proposedPrice != null;
  const cutoverAllowed = canonicalRepricerCutoverAllowed();
  const auditReady = ready && !cutoverAllowed;
  const exportReady = ready && cutoverAllowed;
  const approvalGateType = String(canonical.approval_gate?.type || '').trim().toUpperCase();
  const policyReviewRequired = approvalGateType === 'MARGIN_POLICY_REVIEW';
  const waitingRop = recommendation.status === 'waiting_rop'
    || (approvalGateType === 'SHARP_PRICE_CHANGE' && Boolean(canonical.approval_gate?.required));
  const reasonCodes = Array.isArray(recommendation.reason_codes) ? recommendation.reason_codes : [];
  const runtimeReasonCodes = [...reasonCodes];
  if (approvedOverrideApplied && !runtimeReasonCodes.includes('approved_override')) {
    runtimeReasonCodes.push('approved_override');
  }
  if (approvedOverrideGuard && !runtimeReasonCodes.includes(`approved_override_${approvedOverrideGuard}`)) {
    runtimeReasonCodes.push(`approved_override_${approvedOverrideGuard}`);
  }
  if (auditReady && !runtimeReasonCodes.includes('shadow_cutover_not_allowed')) {
    runtimeReasonCodes.push('shadow_cutover_not_allowed');
  }
  const changed = proposedPrice != null && price != null && Math.abs(numberOrZero(finalPrice) - numberOrZero(price)) >= 1;
  const marginSource = policy.sources?.margin;
  const marginPolicySource = typeof marginSource === 'string'
    ? marginSource
    : [marginSource?.sourceStore, marginSource?.sourceFile].filter(Boolean).join(' · ');
  const internalAdvertisingRub = economics.internal_advertising_per_unit == null
    ? numberOrZero(economicsComponents.internal_advertising_rub)
    : numberOrZero(economics.internal_advertising_per_unit);
  const internalAdvertisingPct = economics.internal_advertising_pct == null
    ? numberOrZero(economicsComponents.internal_advertising_pct)
    : numberOrZero(economics.internal_advertising_pct);
  const fixedCostsRub = economics.fixed_costs_per_unit == null
    ? numberOrZero(economics.logistics_per_unit)
    : numberOrZero(economics.fixed_costs_per_unit);
  const platformCostsRub = economics.platform_costs_per_unit == null
    ? Math.max(0, fixedCostsRub - internalAdvertisingRub)
    : numberOrZero(economics.platform_costs_per_unit);
  const feeStackRub = fixedCostsRub > 0
    ? fixedCostsRub
    : platformCostsRub + internalAdvertisingRub;
  return {
    canonicalSource: true,
    sourceStore: 'canonical_repricer',
    shadowAuditOnly: auditReady,
    cutoverAllowed,
    snapshotId: canonical.snapshot_id || state.canonicalRepricer?.snapshot_id || '',
    platform: canonical.platform,
    articleKey: canonical.article_key,
    status: facts.product_status || policy.lifecycle_key || '',
    currentPrice: price,
    buyerPrice: facts.client_price == null ? null : numberOrZero(facts.client_price),
    currentClientPrice: facts.client_price == null ? null : numberOrZero(facts.client_price),
    currentSppPct: facts.spp_pct == null ? null : numberOrZero(facts.spp_pct),
    stock: facts.stock == null ? null : numberOrZero(facts.stock),
    inboundUnits: facts.inbound == null ? null : numberOrZero(facts.inbound),
    stockStatus: facts.stock_status || '',
    stockGateBlocksAutoprice: !ready,
    currentPriceDate: facts.as_of || '',
    sourceAsOf: facts.as_of || '',
    currentPriceAgeDays: facts.price_age_days == null ? null : numberOrZero(facts.price_age_days),
    currentPriceStale: facts.price_freshness === 'stale' || reasonCodes.includes('stale_current_seller_price'),
    costRub: economics.cost == null ? null : numberOrZero(economics.cost),
    rawCostPresent: economics.cost != null && numberOrZero(economics.cost) > 0,
    commissionPctValue: economics.commission_pct == null ? null : numberOrZero(economics.commission_pct),
    internalAdvertisingPctValue: internalAdvertisingPct,
    internalAdvertisingObservedPctValue: economics.internal_advertising_observed_pct == null
      ? null
      : numberOrZero(economics.internal_advertising_observed_pct),
    internalAdvertisingStatus: economics.internal_advertising_status || '',
    internalAdvertisingSource: typeof economics.sources?.internal_advertising === 'string'
      ? economics.sources.internal_advertising
      : '',
    internalAdvertisingAsOf: economics.internal_advertising_as_of || '',
    logisticsRubValue: economicsComponents.logistics_rub == null
      ? platformCostsRub
      : numberOrZero(economicsComponents.logistics_rub),
    storageRubValue: numberOrZero(economicsComponents.storage_rub),
    adRubValue: internalAdvertisingRub,
    returnsRubValue: numberOrZero(economicsComponents.returns_rub),
    otherRubValue: numberOrZero(economicsComponents.other_rub),
    platformCostsRub,
    internalAdvertisingRub,
    feeStackRub,
    taxPctValue: economics.tax_pct == null ? null : numberOrZero(economics.tax_pct),
    pricingProxyPresent: false,
    hardFloor: floor,
    b2bFloor: floor,
    effectiveFloor: floor,
    economicFloor: floor,
    minMaxFloor: policy.min_max_floor == null ? null : numberOrZero(policy.min_max_floor),
    minMaxCap: policy.min_max_cap == null ? null : numberOrZero(policy.min_max_cap),
    marginFloor: policy.margin_floor == null ? null : numberOrZero(policy.margin_floor),
    marginPolicySource,
    marginGuardRequired: Boolean(policy.margin_guard_required),
    marginPriorityApplied: Boolean(policy.margin_priority_applied),
    capLiftedByMargin: Boolean(policy.cap_lifted_by_margin),
    productLifecycleKey: policy.lifecycle_key || facts.lifecycle_key || '',
    productLifecycleLabel: facts.product_status || policy.lifecycle_key || '',
    finalGuardFloor: floor,
    finalGuardFloorRounded: floor,
    capPrice: cap,
    stretchCap: cap,
    finalGuardCap: cap,
    finalGuardCapRounded: cap,
    recommendedPrice: finalPrice,
    finalPrice,
    preAlignPrice: finalPrice,
    cappedPrice: finalPrice,
    marginPct: approvedOverrideApplied
      ? canonicalRepricerMarginAtPrice(finalPrice, economics)
      : (recommendation.margin_pct == null ? null : numberOrZero(recommendation.margin_pct)),
    currentMarginPct: recommendation.current_margin_pct == null ? null : numberOrZero(recommendation.current_margin_pct),
    requiredMarginPct: policy.target_margin_pct == null ? null : numberOrZero(policy.target_margin_pct),
    marginPolicyMissing: Boolean(
      policy.margin_guard_required
      && (policy.target_margin_pct == null || runtimeReasonCodes.includes('missing_target_margin'))
    ),
    changeRub: price != null && finalPrice != null ? numberOrZero(finalPrice) - numberOrZero(price) : null,
    changePct: approvedOverrideApplied && price > 0
      ? Math.round(((numberOrZero(finalPrice) - price) / price) * 1000000) / 1000000
      : (recommendation.change_pct == null ? null : numberOrZero(recommendation.change_pct)),
    changed,
    belowFloorNow: price != null && floor > 0 && numberOrZero(price) + 0.001 < floor,
    confidence: exportReady ? 'green' : (auditReady ? 'yellow' : 'red'),
    criticalGate: ready ? '' : 'BLOCK',
    finalReasonCode: exportReady ? 'CANONICAL_READY' : (auditReady ? 'CANONICAL_SHADOW_AUDIT' : 'CANONICAL_BLOCKED'),
    reasonCode: exportReady ? 'CANONICAL_READY' : (auditReady ? 'CANONICAL_SHADOW_AUDIT' : 'CANONICAL_BLOCKED'),
    decisionMode: exportReady ? 'ready' : (auditReady ? 'audit' : 'blocked'),
    decisionText: policyReviewRequired
      ? 'Сначала пересогласовать маржу и коридор; цену подтверждать нельзя.'
      : (
        waitingRop
          ? 'Резкая цена ждёт подтверждения РОПа.'
          : (
            auditReady
              ? `${approvedOverrideApplied ? 'Цена согласована РОПом и защищена маржой/MIN/MAX. ' : ''}Расчёт готов для аудита; выгрузка откроется только после допуска canonical cutover.`
              : (
                exportReady
                  ? (approvedOverrideApplied ? 'Согласованная РОПом цена защищена маржой/MIN/MAX и готова к применению.' : 'Канонический расчёт готов к применению.')
                  : 'Канонический расчёт заблокирован.'
              )
          )
      ),
    reasonCodes: runtimeReasonCodes,
    reason: runtimeReasonCodes.join(' · '),
    stopReason: runtimeReasonCodes.join(' · '),
    safeToExport: exportReady && changed,
    promoSafeToExport: false,
    promoActive: false,
    promoConfigured: false,
    promoOfferConfigured: false,
    override: approvedOverrideApplied ? approvedOverride : null,
    approvedOverrideRequestedPrice: approvedOverrideApplied ? approvedRequestedPrice : null,
    approvedOverrideGuard,
    hasOverride: approvedOverrideApplied,
    hasManualOverride: approvedOverrideApplied,
    outOfSpec: false,
    launchHold: '',
    floorRaiseReady: false,
    floorRaiseSafeToExport: false,
    lowStockRisk: false,
    marginRisk: recommendation.margin_pct != null && policy.target_margin_pct != null
      && numberOrZero(recommendation.margin_pct) + 0.0001 < numberOrZero(policy.target_margin_pct),
    liveDeltaRub: null,
    liveDeltaPct: null,
    liveDrift: false,
    hasLiveBenchmark: false,
    economicFloorSource: economics.complete ? 'canonical_economics' : 'canonical_incomplete',
    floorSourceSummary: 'canonical policy',
    capSourceSummary: 'canonical policy',
    baseSourceSummary: 'canonical recommendation',
    passports: canonical.passports || {},
    audit: canonical.audit || {},
    sharpPriceApprovalRequired: waitingRop,
    sharpPriceApprovalPending: false,
    sharpPriceApprovalStatus: waitingRop ? 'required' : (canonical.approval ? 'approved' : 'not_required'),
    sharpPriceAutoTaskEligible: waitingRop
      && !policyReviewRequired
      && !reasonCodes.includes('stale_current_seller_price'),
    marginPolicyReviewRequired: policyReviewRequired
  };
}

function finalizeCanonicalRepricerRows(rows = []) {
  const arrivalMaps = repricerBuildArrivalPriceSignalMaps();
  return rows.map((row) => {
    const normalizedKey = repricerNormalizeArticleKey(row.articleKey || row.article || '');
    ['wb', 'ozon'].forEach((platform) => {
      const side = row?.[platform];
      if (!side) return;
      const fallbackFact = {
        platformStock: numberOrZero(side.stock),
        inboundUnits: numberOrZero(side.inboundUnits),
        shippedUnits: 0,
        procurementSnapshotAvailable: false,
        procurementPresent: false
      };
      side.arrivalFact = arrivalMaps?.[platform]?.get(normalizedKey) || fallbackFact;
      side.arrivalPriceSignal = repricerBuildArrivalPriceSignal(side, side.arrivalFact);
    });
    row.hasManualOverride = false;
    row.hasManagedProfile = false;
    row.hasCorridor = false;
    row.promoActive = false;
    row.promoConfigured = false;
    row.changed = Boolean(row.wb?.changed || row.ozon?.changed);
    row.arrivalPriceCheck = Boolean(row.wb?.arrivalPriceSignal?.needsCheck || row.ozon?.arrivalPriceSignal?.needsCheck);
    row.arrivalPriceMovement = Boolean(row.wb?.arrivalPriceSignal?.hasMovement || row.ozon?.arrivalPriceSignal?.hasMovement);
    row.belowFloorNow = Boolean(row.wb?.belowFloorNow || row.ozon?.belowFloorNow);
    row.marginRisk = Boolean(row.wb?.marginRisk || row.ozon?.marginRisk);
    row.liveBenchmark = false;
    row.liveDrift = false;
    row.blockedByGate = Boolean(row.wb?.criticalGate === 'BLOCK' || row.ozon?.criticalGate === 'BLOCK');
    row.launchHold = false;
    row.alignmentEligible = false;
    row.alignmentChanged = false;
    row.blocked = row.blockedByGate;
    row.searchIndex = [
      row.article,
      row.articleKey,
      row.brand,
      row.name,
      row.owner,
      ...Object.values(row.ownerByPlatform || {}),
      row.status,
      row.productLifecycle?.label,
      row.wb?.reason,
      row.ozon?.reason,
      row.wb?.reasonCode,
      row.ozon?.reasonCode,
      row.wb?.arrivalPriceSignal?.label,
      row.ozon?.arrivalPriceSignal?.label,
      ...(row.wb?.arrivalPriceSignal?.reasons || []),
      ...(row.ozon?.arrivalPriceSignal?.reasons || [])
    ].filter(Boolean).join(' ').toLowerCase();
    row.maxAbsDelta = Math.max(Math.abs(numberOrZero(row.wb?.changeRub)), Math.abs(numberOrZero(row.ozon?.changeRub)));
    return row;
  }).sort((left, right) => Number(right.blockedByGate) - Number(left.blockedByGate)
    || Number(right.arrivalPriceCheck) - Number(left.arrivalPriceCheck)
    || Number(right.belowFloorNow) - Number(left.belowFloorNow)
    || Number(right.marginRisk) - Number(left.marginRisk)
    || Number(right.changed) - Number(left.changed)
    || numberOrZero(right.maxAbsDelta) - numberOrZero(left.maxAbsDelta)
    || String(left.article || left.articleKey).localeCompare(String(right.article || right.articleKey), 'ru'));
}

function buildCanonicalRepricerRowsFresh() {
  if (!canonicalRepricerRowsAvailable()) return [];
  const skuMap = repricerSkuFactMap();
  const byArticle = new Map();
  state.canonicalRepricer.rows.forEach((canonical) => {
    const platform = String(canonical.platform || '').trim().toLowerCase();
    if (!['wb', 'ozon', 'ym'].includes(platform)) return;
    const articleKey = String(canonical.article_key || canonical.articleKey || '').trim();
    const normalizedKey = repricerNormalizeArticleKey(articleKey);
    if (!articleKey || !normalizedKey) return;
    const skuFact = skuMap.get(normalizedKey) || null;
    if (!byArticle.has(articleKey)) {
      byArticle.set(articleKey, {
        articleKey,
        article: articleKey,
        brand: skuFact?.brand || '',
        name: skuFact?.name || '',
        owner: typeof platformOwnerName === 'function'
          ? (platformOwnerName(skuFact, platform) || (typeof skuFact?.owner === 'object' ? skuFact.owner?.name : skuFact?.owner) || '')
          : ((typeof skuFact?.owner === 'object' ? skuFact.owner?.name : skuFact?.owner) || ''),
        ownerByPlatform: {},
        status: canonical?.facts?.product_status || skuFact?.status || skuFact?.registryStatus || '',
        productLifecycle: canonical?.policy?.lifecycle_key
          ? {
            key: canonical.policy.lifecycle_key,
            label: canonical.facts?.product_status || canonical.policy.lifecycle_key,
            status: canonical.facts?.product_status || canonical.policy.lifecycle_key
          }
          : null,
        role: '',
        launchReady: '',
        segment: skuFact?.segment || '',
        abc: skuFact?.abc || '',
        profile: null,
        liveRow: null,
        skuFact,
        wb: null,
        ozon: null,
        ym: null,
        canonicalSource: true,
        canonicalSnapshotId: canonical.snapshot_id || state.canonicalRepricer?.snapshot_id || ''
      });
    }
    const row = byArticle.get(articleKey);
    const owner = typeof platformOwnerName === 'function' ? platformOwnerName(skuFact, platform) : '';
    if (owner) row.ownerByPlatform[platform] = owner;
    if (platform === 'wb' || platform === 'ozon' || platform === 'ym') {
      row[platform] = canonicalRepricerRuntimeSide(canonical);
    }
  });
  return finalizeCanonicalRepricerRows([...byArticle.values()]);
}

function buildRepricerRowsFresh() {
  const canonicalRows = buildCanonicalRepricerRowsFresh();
  if (canonicalRows.length) return canonicalRows;
  const settings = normalizeRepricerSettings(state.storage?.repricerSettings || {});
  const platforms = state.smartPriceWorkbench?.platforms || {};
  const liveMap = repricerLiveMap();
  const skuMap = repricerSkuFactMap();
  const legacyMap = repricerLegacyMap();
  const supportMaps = {
    wb: repricerSupportMap('wb'),
    ozon: repricerSupportMap('ozon')
  };
  const pricesMaps = {
    wb: repricerPricesMap('wb'),
    ozon: repricerPricesMap('ozon')
  };
  const arrivalMaps = repricerBuildArrivalPriceSignalMaps();
  const byArticle = new Map();
  ['wb', 'ozon'].forEach((platform) => {
    const primaryRows = Array.isArray(platforms?.[platform]?.rows) ? platforms[platform].rows : [];
    const rows = repricerRowsWithLegacyFallback(platform, primaryRows);
    rows.forEach((sourceRow) => {
      const articleKey = sourceRow.articleKey || sourceRow.article || '';
      if (!articleKey) return;
      const normalizedKey = repricerNormalizeArticleKey(articleKey);
      const liveRow = liveMap.get(normalizedKey) || null;
      const skuFact = skuMap.get(normalizedKey) || null;
      const legacyRow = legacyMap.get(normalizedKey) || null;
      const legacySide = legacyRow && legacyRow[platform] && typeof legacyRow[platform] === 'object'
        ? legacyRow[platform]
        : null;
      const supportRow = supportMaps[platform].get(normalizedKey) || null;
      const priceRow = pricesMaps[platform].get(normalizedKey) || null;
      if (repricerOutOfScopeBrandForRows(sourceRow, supportRow, priceRow, skuFact, legacyRow, legacySide)) return;
      const profile = repricerFindSkuProfile(articleKey);
      const resolvedBrand = repricerCanonicalBrandName(sourceRow.brand || skuFact?.brand || '');
      const skuOwnerName = typeof skuFact?.owner === 'object' ? skuFact.owner?.name : skuFact?.owner;
      const platformSpecificOwner = typeof platformOwnerName === 'function'
        ? platformOwnerName(skuFact, platform)
        : '';
      const skuPlatformStatus = skuFact?.platformMatrix?.[platform]?.status
        || skuFact?.[platform]?.status
        || '';
      const fallbackStatus = skuPlatformStatus
        || skuFact?.productStatus
        || skuFact?.sheetStatus
        || skuFact?.registryStatus
        || skuFact?.status
        || sourceRow.status
        || supportRow?.repricerStatus
        || supportRow?.productStatus
        || '';
      const productLifecycle = repricerProductLifecycleForRecord({
        ...(skuFact || {}),
        articleKey,
        article: sourceRow.article || articleKey,
        productLifecycle: skuFact?.productLifecycle,
        productLifecycleStatus: skuFact?.productLifecycleStatus || sourceRow.productLifecycleStatus || supportRow?.productLifecycleStatus,
        lifecycleStatus: skuFact?.lifecycleStatus || sourceRow.lifecycleStatus || supportRow?.lifecycleStatus,
        productStatus: skuPlatformStatus
          || skuFact?.productStatus
          || skuFact?.sheetStatus
          || skuFact?.registryStatus
          || sourceRow.productStatus
          || supportRow?.productStatus,
        sheetStatus: skuFact?.sheetStatus || sourceRow.sheetStatus || supportRow?.sheetStatus,
        registryStatus: skuFact?.registryStatus || sourceRow.registryStatus || supportRow?.registryStatus,
        status: fallbackStatus
      }, fallbackStatus, articleKey);
      const resolvedStatus = productLifecycle?.label || productLifecycle?.status || fallbackStatus;
      const resolvedRole = profile?.role || repricerSuggestedRole(resolvedStatus, sourceRow.segment || supportRow?.segment || skuFact?.segment);
      const resolvedLaunchReady = normalizeRepricerLaunchReady(profile?.launchReady || repricerDefaultLaunchReady(resolvedStatus));
      if (!byArticle.has(articleKey)) byArticle.set(articleKey, {
        articleKey,
        article: sourceRow.article || articleKey,
        brand: resolvedBrand,
        name: sourceRow.name || supportRow?.name || priceRow?.name || skuFact?.name || '',
        owner: platformSpecificOwner || sourceRow.owner || supportRow?.owner || priceRow?.owner || skuOwnerName || '',
        ownerByPlatform: {},
        status: resolvedStatus,
        productLifecycle,
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
      const resolvedPlatformOwner = platformSpecificOwner || sourceRow.owner || supportRow?.owner || priceRow?.owner || '';
      if (resolvedPlatformOwner) row.ownerByPlatform[platform] = resolvedPlatformOwner;
      row.article = row.article || sourceRow.article || articleKey;
      row.brand = row.brand || resolvedBrand;
      row.name = row.name || sourceRow.name || supportRow?.name || priceRow?.name || skuFact?.name || '';
      row.owner = row.owner || platformSpecificOwner || sourceRow.owner || supportRow?.owner || priceRow?.owner || skuOwnerName || '';
      row.productLifecycle = row.productLifecycle?.key && row.productLifecycle.key !== 'active'
        ? row.productLifecycle
        : (productLifecycle || row.productLifecycle || null);
      row.status = row.productLifecycle?.label || row.productLifecycle?.status || row.status || skuPlatformStatus || skuFact?.status || sourceRow.status || supportRow?.repricerStatus || supportRow?.productStatus || '';
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
        productLifecycle: row.productLifecycle,
        role: row.role,
        launchReady: row.launchReady,
        liveRow: row.liveRow,
        skuFact: row.skuFact,
        legacyRow,
        legacySide,
        supportRow,
        priceRow,
        profile: row.profile,
        arrivalFact: arrivalMaps[platform]?.get(normalizedKey) || null
      });
    });
  });
  return [...byArticle.values()].map((row) => {
    repricerApplyAlignment(row, settings);
    repricerApplyOutlierGuard(row);
    row.hasManualOverride = Boolean(row.wb?.hasOverride || row.ozon?.hasOverride);
    row.hasManagedProfile = repricerHasSkuProfile(row.profile);
    row.hasCorridor = Boolean(row.wb?.hasCorridor || row.ozon?.hasCorridor);
    row.promoActive = Boolean(row.wb?.promoActive || row.ozon?.promoActive);
    row.promoConfigured = Boolean(row.wb?.promoConfigured || row.ozon?.promoConfigured);
    row.changed = Boolean(row.wb?.changed || row.ozon?.changed);
    row.arrivalPriceCheck = Boolean(row.wb?.arrivalPriceSignal?.needsCheck || row.ozon?.arrivalPriceSignal?.needsCheck);
    row.arrivalPriceMovement = Boolean(row.wb?.arrivalPriceSignal?.hasMovement || row.ozon?.arrivalPriceSignal?.hasMovement);
    row.belowFloorNow = Boolean(row.wb?.belowFloorNow || row.ozon?.belowFloorNow);
    row.marginRisk = Boolean(row.wb?.marginRisk || row.ozon?.marginRisk);
    row.liveBenchmark = Boolean(row.wb?.hasLiveBenchmark || row.ozon?.hasLiveBenchmark);
    row.liveDrift = Boolean(row.wb?.liveDrift || row.ozon?.liveDrift);
    row.blockedByGate = Boolean(row.wb?.criticalGate === 'BLOCK' || row.ozon?.criticalGate === 'BLOCK');
    row.launchHold = Boolean(row.wb?.launchHold || row.ozon?.launchHold);
    row.alignmentEligible = Boolean(row.alignmentEligible);
    row.alignmentChanged = Boolean(row.alignmentChanged);
    row.blocked = ['freeze', 'hold', 'force', 'off'].includes(row.wb?.mode) || ['freeze', 'hold', 'force', 'off'].includes(row.ozon?.mode);
    row.searchIndex = [row.article, row.articleKey, row.brand, row.name, row.owner, ...Object.values(row.ownerByPlatform || {}), row.status, row.productLifecycle?.label, row.productLifecycle?.reason, row.productLifecycle?.source, row.role, row.launchReady, row.segment, row.abc, row.alignmentScenario, row.alignmentReason, row.wb?.reason, row.ozon?.reason, row.wb?.reasonCode, row.ozon?.reasonCode, row.wb?.liveStrategy, row.ozon?.liveStrategy, row.wb?.liveReason, row.ozon?.liveReason, row.wb?.promoLabel, row.ozon?.promoLabel, row.wb?.promoSourceLabel, row.ozon?.promoSourceLabel, row.wb?.promoOfferLabel, row.ozon?.promoOfferLabel, row.wb?.promoOfferSourceLabel, row.ozon?.promoOfferSourceLabel, row.wb?.arrivalPriceSignal?.label, row.ozon?.arrivalPriceSignal?.label, ...(row.wb?.arrivalPriceSignal?.reasons || []), ...(row.ozon?.arrivalPriceSignal?.reasons || [])].filter(Boolean).join(' ').toLowerCase();
    row.maxAbsDelta = Math.max(Math.abs(numberOrZero(row.wb?.changeRub)), Math.abs(numberOrZero(row.ozon?.changeRub)));
    return row;
  }).sort((a, b) => Number(b.hasManualOverride) - Number(a.hasManualOverride)
    || Number(b.hasManagedProfile) - Number(a.hasManagedProfile)
    || Number(b.hasCorridor) - Number(a.hasCorridor)
    || Number(b.blockedByGate) - Number(a.blockedByGate)
    || Number(b.arrivalPriceCheck) - Number(a.arrivalPriceCheck)
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
      arrivalCheck: Boolean(row?.wb?.arrivalPriceSignal?.needsCheck),
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
      arrivalCheck: Boolean(row?.ozon?.arrivalPriceSignal?.needsCheck),
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
      arrivalCheck: Boolean(row?.arrivalPriceCheck),
      blocked: Boolean(row?.blocked || row?.blockedByGate)
    }
  };
  const scope = byPlatform[platform || 'all'] || byPlatform.all;
  if (mode === 'all') return true;
  if (mode === 'changes') return scope.changed || scope.arrivalCheck;
  if (mode === 'arrival_price_check') return scope.arrivalCheck;
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

function getFilteredRepricerRows(sourceRows = null) {
  const search = String(state.repricerFilters.search || '').trim().toLowerCase();
  const platform = state.repricerFilters.platform || 'all';
  const mode = state.repricerFilters.mode || 'changes';
  const economicSource = state.repricerFilters.economicSource || 'all';
  const rows = Array.isArray(sourceRows) ? sourceRows : buildRepricerRows();
  return rows.filter((row) => {
    if (search && !String(row.searchIndex || '').includes(search)) return false;
    if (platform === 'wb' && !row?.wb) return false;
    if (platform === 'ozon' && !row?.ozon) return false;
    if (!repricerModeMatches(row, platform, mode)) return false;
    if (!repricerEconomicSourceMatches(row, platform, economicSource)) return false;
    return true;
  });
}

function repricerOwnerForPlatform(row, platform = '') {
  const owners = row?.ownerByPlatform && typeof row.ownerByPlatform === 'object'
    ? row.ownerByPlatform
    : {};
  const ownerText = (value) => typeof normalizeOwnerToken === 'function'
    ? normalizeOwnerToken(value)
    : String(typeof value === 'object' ? (value?.name || value?.owner || '') : (value || '')).trim();
  if (platform === 'wb') return ownerText(owners.wb) || ownerText(row?.owner);
  if (platform === 'ozon') return ownerText(owners.ozon) || ownerText(row?.owner);
  const unique = [owners.wb, owners.ozon, row?.owner]
    .map(ownerText)
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  return unique.length > 1 ? unique.join(' · ') : (unique[0] || '');
}

function repricerDuplicateNameKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildRepricerDuplicateNameMap(rows) {
  const groups = new Map();
  (rows || []).forEach((row) => {
    const key = repricerDuplicateNameKey(row?.name);
    if (!key || key.length < 10) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  const byArticle = new Map();
  let duplicateGroups = 0;
  let duplicateRows = 0;
  groups.forEach((items) => {
    if (!Array.isArray(items) || items.length < 2) return;
    duplicateGroups += 1;
    duplicateRows += items.length;
    const articles = items
      .map((row) => String(row?.article || row?.articleKey || '').trim())
      .filter(Boolean);
    items.forEach((row) => {
      byArticle.set(String(row?.articleKey || '').trim(), {
        count: items.length,
        articles
      });
    });
  });
  return {
    byArticle,
    duplicateGroups,
    duplicateRows
  };
}

function ensureRepricerUiState() {
  if (!state.repricerUi || typeof state.repricerUi !== 'object') state.repricerUi = {};
  if (!state.repricerUi.sections || typeof state.repricerUi.sections !== 'object') state.repricerUi.sections = {};
  if (!state.repricerUi.history || typeof state.repricerUi.history !== 'object') state.repricerUi.history = {};
  if (!state.repricerUi.controls || typeof state.repricerUi.controls !== 'object') state.repricerUi.controls = {};
  return state.repricerUi;
}

function repricerUiToggleOpen(bucket, key, fallback = false) {
  const ui = ensureRepricerUiState();
  if (!(key in ui[bucket])) return fallback;
  return Boolean(ui[bucket][key]);
}

function repricerSetUiToggleOpen(bucket, key, open) {
  const ui = ensureRepricerUiState();
  ui[bucket][key] = Boolean(open);
}

function repricerSettingField(label, inputHtml, note = '') {
  return `<label style="display:grid; gap:6px"><span class="muted small">${escapeHtml(label)}</span>${inputHtml}${note ? `<span class="muted small">${escapeHtml(note)}</span>` : ''}</label>`;
}

function renderRepricerSettingsSection(sectionKey, title, meta, description, body, openByDefault = false) {
  const isOpen = repricerUiToggleOpen('sections', sectionKey, openByDefault);
  return `
    <details data-repricer-section="${escapeHtml(sectionKey)}" ${isOpen ? 'open' : ''} style="margin-top:14px">
      <summary style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:12px">
        <span><strong>${escapeHtml(title)}</strong></span>
        ${meta ? `<span class="muted small">${escapeHtml(meta)}</span>` : ''}
      </summary>
      <div class="muted small" style="margin-top:10px">${escapeHtml(description)}</div>
      ${body}
    </details>
  `;
}

function renderRepricerSmokeTests(smokeTests, smokePassed) {
  const isOpen = repricerUiToggleOpen('sections', 'smokeTests', false);
  return `
    <details data-repricer-section="smokeTests" ${isOpen ? 'open' : ''} style="margin-top:12px">
      <summary class="small muted" style="cursor:pointer">Smoke tests · ${escapeHtml(`${fmt.int(smokePassed)}/${fmt.int(smokeTests.length)}`)}</summary>
      <div class="stack" style="margin-top:12px">
        ${smokeTests.map((test) => `<div class="owner-cell" style="display:flex; justify-content:space-between; gap:12px; align-items:center"><div><strong>${escapeHtml(test.id)}</strong><div class="muted small">${escapeHtml(test.expectedMode)} / ${escapeHtml(test.expectedReason)} → ${escapeHtml(test.actualMode)} / ${escapeHtml(test.actualReason)}</div></div>${badge(test.pass ? 'pass' : 'fail', test.pass ? 'ok' : 'danger')}</div>`).join('')}
      </div>
    </details>
  `;
}

function renderRepricerHistoryBlock(side) {
  const historyKey = `${String(side.articleKey || '').trim()}::${String(side.platform || '').trim()}`;
  const isOpen = repricerUiToggleOpen('history', historyKey, false);
  const repairHistory = repricerHistoryForSide(side, 5);
  const repairLines = repairHistory.map((item) => `
    <div class="repricer-repair-history-row">
      <strong>${escapeHtml(fmt.date(item.createdAt))} · ${escapeHtml(item.command || item.source || 'решение')}</strong>
      <span>${escapeHtml(item.before || '')}${item.after ? ` → ${escapeHtml(item.after)}` : ''}</span>
      ${item.details ? `<em>${escapeHtml(item.details)}</em>` : ''}
    </div>
  `).join('');
  const lines = [
    repairLines ? `<div class="repricer-repair-history">${repairLines}</div>` : '',
    `<div class="muted small">Sources: min ${escapeHtml(side.floorSourceSummary || '—')} · max ${escapeHtml(side.capSourceSummary || '—')} · base ${escapeHtml(side.baseSourceSummary || '—')}${side.promoConfigured ? ` · promo floor ${escapeHtml(side.promoFloorSourceSummary || '—')}` : ''}</div>`,
    side.floorGuardApplied || side.capGuardApplied ? `<div class="muted small">Guards: floor ${fmt.money(side.finalGuardFloor)}${side.capGuardApplied ? ` · cap ${fmt.money(side.finalGuardCap)}` : ''}</div>` : '',
    side.promoConfigured ? `<div class="muted small">Активный промо-сценарий: ${side.promoActive ? fmt.money(side.promoPrice) : 'не активен'}${side.promoSource ? ` · ${escapeHtml(side.promoSource === 'promo_offer' ? 'предложение акции' : 'ручной override')}` : ''}${side.promoSource === 'promo_offer' && side.promoSourceLabel ? ` · ${escapeHtml(side.promoSourceLabel)}` : ''}${side.promoLabel ? ` · ${escapeHtml(side.promoLabel)}` : ''}${side.promoFrom ? ` · с ${escapeHtml(side.promoFrom)}` : ''}${side.promoTo ? ` · по ${escapeHtml(side.promoTo)}` : ''}${side.promoAdjustedToFloor ? ` · защитный floor ${fmt.money(side.promoFloor)}` : ''}</div>` : '',
    side.manualPromoConfigured ? `<div class="muted small">Ручное промо: ${fmt.money(side.manualPromoRequestedPrice)}${side.manualPromoLabel ? ` · ${escapeHtml(side.manualPromoLabel)}` : ''}${side.manualPromoFrom ? ` · с ${escapeHtml(side.manualPromoFrom)}` : ''}${side.manualPromoTo ? ` · по ${escapeHtml(side.manualPromoTo)}` : ''}${side.manualPromoAdjustedToFloor ? ` · floor guard ${fmt.money(side.promoFloor)}` : ''}</div>` : '',
    side.promoOfferConfigured ? `<div class="muted small">Предложение акции: ${fmt.money(side.promoOfferRequestedPrice)}${side.promoOfferSourceLabel ? ` · ${escapeHtml(side.promoOfferSourceLabel)}` : ''}${side.promoOfferLabel ? ` · ${escapeHtml(side.promoOfferLabel)}` : ''}${side.promoOfferFrom ? ` · с ${escapeHtml(side.promoOfferFrom)}` : ''}${side.promoOfferTo ? ` · по ${escapeHtml(side.promoOfferTo)}` : ''}${side.promoOfferAdjustedToFloor ? ` · floor guard ${fmt.money(side.promoFloor)}` : ''}</div>` : '',
    side.chosenScenario && !side.promoActive ? `<div class="muted small">Alignment: ${escapeHtml(side.chosenScenario)} · keep ${fmt.money(side.keepPrice)} · follow ${fmt.money(side.followPrice)} · score keep ${fmt.num(side.keepScore, 0)} · score follow ${fmt.num(side.followScore, 0)}</div>` : '',
    side.hasLiveBenchmark ? `<div class="muted small">Live repricer: ${escapeHtml(side.liveStrategy || 'без стратегии')} · target ${fmt.int(side.liveTargetDays)} дн.${side.liveReason ? ` · ${escapeHtml(side.liveReason)}` : ''}</div>` : '',
    side.skuMinPrice > 0 || side.ordersDaily > 0 || side.inboundUnits > 0 || side.leadTimeDays > 0 ? `<div class="muted small">SKU/Order: min ${fmt.money(side.skuMinPrice)} · заказы ${fmt.num(side.ordersDaily, 1)} шт./день · в пути ${fmt.int(side.inboundUnits)} · lead ${fmt.int(side.leadTimeDays)} дн. · turnover ${escapeHtml(side.turnoverSource || '—')}</div>` : '',
    side.arrivalPriceSignal?.hasMovement ? `<div class="muted small">Приход/площадка: ${escapeHtml(side.arrivalPriceSignal.stockLabel)}${side.arrivalPriceSignal.places?.length ? ` · ${escapeHtml(side.arrivalPriceSignal.places.join(', '))}` : ''}</div>` : '',
    `<div class="muted small">История до: ${escapeHtml(side.historyFreshnessDate || '—')}${side.historyNote ? ` · ${escapeHtml(side.historyNote)}` : ''}</div>`
  ].filter(Boolean).join('');
  return `
    <details data-repricer-history="${escapeHtml(historyKey)}" ${isOpen ? 'open' : ''} style="margin-top:10px">
      <summary class="small muted" style="cursor:pointer">История и источники</summary>
      <div class="stack" style="margin-top:10px">${lines}</div>
    </details>
  `;
}

function renderRepricerSettingsCard(settings, brandNames, statuses, roles, feePlatforms) {
  const settingsSavedAt = state.storage?.repricerSettingsUpdatedAt || '';
  const syncScope = hasRemoteStore() ? 'локально и в командной базе' : 'локально в браузере';
  const updatedLabel = settingsSavedAt ? fmt.date(settingsSavedAt) : 'ещё не сохранялись';
  const isOpen = repricerUiToggleOpen('sections', 'settingsCardV2', false);
  if (!isOpen) {
    return `
      <details class="card repricer-settings-card" data-repricer-section="settingsCardV2" style="margin-top:14px">
        <summary class="section-subhead" style="cursor:pointer; list-style:none">
          <div>
            <h3>Массовые правила репрайсера</h3>
            <p class="small muted">Это общие правила расчёта для всего контура. Для одной SKU лучше работать ниже через MIN/MAX, corridor или ручное решение.</p>
          </div>
          <div class="badge-stack">${badge('автосохранение', 'ok')}${badge(syncScope, hasRemoteStore() ? 'ok' : 'info')}${badge(`сохранено ${updatedLabel}`, settingsSavedAt ? 'ok' : 'info')}</div>
        </summary>
        <div class="muted small" style="margin-top:10px">Блок не строит тяжёлые формы до открытия, чтобы репрайсер быстрее загружал рабочий список SKU.</div>
      </details>
    `;
  }
  const globalSection = renderRepricerSettingsSection(
    'globalRules',
    'Общие правила',
    'база для всего контура',
    'Это общий fallback для всех SKU. Бренд, статус и роль ниже могут переопределять эти значения.',
    `
      <div class="filters repricer-filters" data-repricer-global-card style="margin-top:12px">
        ${repricerSettingField('Мин. маржа, %', `<input type="number" step="0.1" min="0" name="minMarginPct" value="${escapeHtml(settings.global.minMarginPct)}" placeholder="Мин. маржа, %">`)}
        ${repricerSettingField('Цель по обороту, дн.', `<input type="number" step="1" min="1" name="defaultTargetDays" value="${escapeHtml(settings.global.defaultTargetDays)}" placeholder="Цель, дн.">`)}
        ${repricerSettingField('Цель для launch, дн.', `<input type="number" step="1" min="1" name="launchTargetDays" value="${escapeHtml(settings.global.launchTargetDays)}" placeholder="Launch, дн.">`)}
        ${repricerSettingField('Порог OOS, дн.', `<input type="number" step="1" min="1" name="oosDays" value="${escapeHtml(settings.global.oosDays)}" placeholder="OOS, дн.">`)}
        ${repricerSettingField('Deadband, %', `<input type="number" step="0.1" min="0" name="deadbandPct" value="${escapeHtml(settings.global.deadbandPct)}" placeholder="Deadband, %">`)}
        ${repricerSettingField('Deadband, ₽', `<input type="number" step="1" min="0" name="deadbandRub" value="${escapeHtml(settings.global.deadbandRub)}" placeholder="Deadband, ₽">`)}
      </div>
      <label class="muted small" style="display:flex; align-items:center; gap:8px; margin-top:10px">
        <input type="checkbox" name="alignmentEnabled" ${settings.global.alignmentEnabled ? 'checked' : ''}>
        Разрешить alignment WB/Ozon по score-модели
      </label>
    `,
    true
  );
  const brandSection = renderRepricerSettingsSection(
    'brandRules',
    'Правила брендов',
    `${brandNames.length} брендов`,
    'Здесь задаём целевую оборачиваемость и маржу для бренда. Если бренда в списке нет, работает общий fallback.',
    `
      <div class="stack" style="margin-top:12px">
        ${brandNames.map((brand) => {
          const rule = normalizeRepricerBrandRule(settings.brandRules?.[brand] || {}, defaultRepricerSettings().brandRules?.[brand] || defaultRepricerSettings().global);
          return `<div class="owner-cell" data-repricer-brand-card="${escapeHtml(brand)}" style="display:grid; gap:10px"><div style="display:flex; justify-content:space-between; align-items:center; gap:12px"><div><strong>${escapeHtml(brand)}</strong><div class="muted small">Применяется ко всем SKU этого бренда.</div></div><label class="muted small" style="display:flex; align-items:center; gap:8px"><input type="checkbox" name="alignmentEnabled" ${rule.alignmentEnabled ? 'checked' : ''}>Разрешить alignment</label></div><div class="filters repricer-filters">${repricerSettingField('Мин. маржа, %', `<input type="number" step="0.1" min="0" name="minMarginPct" value="${escapeHtml(rule.minMarginPct)}" placeholder="Мин. маржа, %">`)}${repricerSettingField('Цель по обороту, дн.', `<input type="number" step="1" min="1" name="defaultTargetDays" value="${escapeHtml(rule.defaultTargetDays)}" placeholder="Цель, дн.">`)}${repricerSettingField('Цель для launch, дн.', `<input type="number" step="1" min="1" name="launchTargetDays" value="${escapeHtml(rule.launchTargetDays)}" placeholder="Launch, дн.">`)}${repricerSettingField('Порог OOS, дн.', `<input type="number" step="1" min="1" name="oosDays" value="${escapeHtml(rule.oosDays)}" placeholder="OOS, дн.">`)}</div></div>`;
        }).join('')}
      </div>
    `
  );
  const statusSection = renderRepricerSettingsSection(
    'statusRules',
    'Карта статусов',
    `${statuses.length} статусов`,
    'Mode задаёт базовый сценарий: Auto — обычный расчёт, Launch — мягкий режим новинки, Freeze — не двигаем автоматически, Off — рекомендацию не даём.',
    `
      <div class="stack" style="margin-top:12px">
        ${statuses.map((status) => {
          const rule = normalizeRepricerStatusRule(settings.statusRules?.[status] || {});
          return `<div class="owner-cell" data-repricer-status-card="${escapeHtml(status)}" style="display:grid; gap:10px"><div style="display:flex; justify-content:space-between; align-items:center; gap:12px"><div><strong>${escapeHtml(status)}</strong><div class="muted small">Как этот статус влияет на auto / launch / alignment.</div></div></div><div class="filters repricer-filters">${repricerSettingField('Режим', `<select name="mode"><option value="auto" ${rule.mode === 'auto' ? 'selected' : ''}>Auto</option><option value="launch" ${rule.mode === 'launch' ? 'selected' : ''}>Launch</option><option value="freeze" ${rule.mode === 'freeze' ? 'selected' : ''}>Freeze</option><option value="off" ${rule.mode === 'off' ? 'selected' : ''}>Off</option></select>`)}<label style="display:grid; gap:6px"><span class="muted small">AUTO</span><span class="muted small"><input type="checkbox" name="allowAutoprice" ${rule.allowAutoprice ? 'checked' : ''}> Разрешить</span></label><label style="display:grid; gap:6px"><span class="muted small">Launch</span><span class="muted small"><input type="checkbox" name="allowLaunch" ${rule.allowLaunch ? 'checked' : ''}> Разрешить</span></label><label style="display:grid; gap:6px"><span class="muted small">Alignment</span><span class="muted small"><input type="checkbox" name="allowAlignment" ${rule.allowAlignment ? 'checked' : ''}> Разрешить</span></label></div></div>`;
        }).join('')}
      </div>
    `
  );
  const roleSection = renderRepricerSettingsSection(
    'roleRules',
    'Правила ролей SKU',
    `${roles.length} ролей`,
    'Role управляет целевой оборачиваемостью и агрессивностью цены. Stretch — насколько можно держаться выше базы, Elasticity — чувствительность спроса.',
    `
      <div class="stack" style="margin-top:12px">
        ${roles.map((role) => {
          const rule = normalizeRepricerRoleRule(settings.roleRules?.[role] || {});
          return `<div class="owner-cell" data-repricer-role-card="${escapeHtml(role)}" style="display:grid; gap:10px"><div><strong>${escapeHtml(role)}</strong><div class="muted small">Настраивает скорость оборота и мягкость изменения цены.</div></div><div class="filters repricer-filters">${repricerSettingField('Цель, дн.', `<input type="number" step="1" min="1" name="targetDays" value="${escapeHtml(rule.targetDays)}" placeholder="Target days">`)}${repricerSettingField('Мин. lift, %', `<input type="number" step="0.1" min="0" name="minLiftPct" value="${escapeHtml(rule.minLiftPct)}" placeholder="Min lift, %">`)}${repricerSettingField('Stretch', `<input type="number" step="0.01" min="1" name="stretchMultiplier" value="${escapeHtml(rule.stretchMultiplier)}" placeholder="Stretch">`)}${repricerSettingField('Elasticity', `<input type="number" step="0.1" name="elasticityDefault" value="${escapeHtml(rule.elasticityDefault)}" placeholder="Elasticity">`)}</div><label class="muted small" style="display:flex; align-items:center; gap:8px"><input type="checkbox" name="allowVolumePush" ${rule.allowVolumePush ? 'checked' : ''}>Разрешить volume push при перегреве оборачиваемости</label></div>`;
        }).join('')}
      </div>
    `
  );
  const feeSection = renderRepricerSettingsSection(
    'feeRules',
    'Fee stack по площадкам',
    `${feePlatforms.length} площадок`,
    'Нужен для расчёта economic floor, когда в источнике есть себестоимость. Если cost нет, этот блок не влияет на цену.',
    `
      <div class="stack" style="margin-top:12px">
        ${feePlatforms.map((platform) => {
          const rule = normalizeRepricerFeeRule(settings.feeRules?.[platform] || {});
          return `<div class="owner-cell" data-repricer-fee-card="${escapeHtml(platform)}" style="display:grid; gap:10px"><div><strong>${escapeHtml(String(platform).toUpperCase())}</strong><div class="muted small">Комиссия ИУ и внутренняя реклама считаются процентами от цены; логистика, хранение и возвраты — рублями на единицу.</div></div><div class="filters repricer-filters">${repricerSettingField('Комиссия ИУ, %', `<input type="number" step="0.0001" min="0" name="commissionPct" value="${escapeHtml(rule.commissionPct)}" placeholder="Комиссия ИУ, %">`)}${repricerSettingField('Логистика, ₽', `<input type="number" step="1" min="0" name="logisticsRub" value="${escapeHtml(rule.logisticsRub)}" placeholder="Логистика, ₽">`)}${repricerSettingField('Хранение, ₽', `<input type="number" step="1" min="0" name="storageRub" value="${escapeHtml(rule.storageRub)}" placeholder="Хранение, ₽">`)}${repricerSettingField('Внутр. реклама, %', `<input type="number" step="0.001" min="0" name="adPct" value="${escapeHtml(rule.adPct)}" placeholder="Реклама, %">`)}${repricerSettingField('Внутр. реклама, ₽/шт.', `<input type="number" step="1" min="0" name="adRub" value="${escapeHtml(rule.adRub)}" placeholder="Доп. реклама, ₽/шт.">`)}${repricerSettingField('Возвраты, ₽', `<input type="number" step="1" min="0" name="returnsRub" value="${escapeHtml(rule.returnsRub)}" placeholder="Возвраты, ₽">`)}${repricerSettingField('Прочее, ₽', `<input type="number" step="1" min="0" name="otherRub" value="${escapeHtml(rule.otherRub)}" placeholder="Прочее, ₽">`)}</div></div>`;
        }).join('')}
      </div>
    `
  );
  return `
    <details class="card repricer-settings-card" data-repricer-section="settingsCardV2" ${isOpen ? 'open' : ''} style="margin-top:14px">
      <summary class="section-subhead" style="cursor:pointer; list-style:none">
        <div>
          <h3>Массовые правила репрайсера</h3>
          <p class="small muted">Это общие правила расчёта для всего контура. Для одной SKU лучше работать ниже через MIN/MAX, corridor или ручное решение.</p>
        </div>
        <div class="badge-stack">${badge('автосохранение', 'ok')}${badge(syncScope, hasRemoteStore() ? 'ok' : 'info')}${badge(`сохранено ${updatedLabel}`, settingsSavedAt ? 'ok' : 'info')}</div>
      </summary>
      <div class="muted small" style="margin-top:10px">Открывайте этот блок, только если правило должно влиять сразу на много SKU. Точечные действия по одной карточке удобнее делать в карточке SKU ниже.</div>
      <form id="repricerSettingsForm">
        ${globalSection}
        ${brandSection}
        ${statusSection}
        ${roleSection}
        ${feeSection}
        <div class="quick-actions" style="margin-top:14px">
          <button type="submit" class="quick-chip">Сохранить сейчас</button>
          <button type="button" class="quick-chip" data-repricer-settings-reset>Сбросить к базовым</button>
        </div>
      </form>
    </details>
  `;
}

function renderRepricerWorkflowGuide() {
  return `
    <div class="grid cards repricer-guide-grid" style="margin-top:14px">
      <div class="card repricer-guide-card">
        <div class="label">1. Проверяем границы</div>
        <div class="value">MIN / MAX</div>
        <div class="hint">Если в «Ценах» меняем MIN/MAX, репрайсер сразу пересчитывает финальную цену в этих границах.</div>
      </div>
      <div class="card repricer-guide-card">
        <div class="label">2. Если нужен ручной шаг</div>
        <div class="value">Фикс / промо</div>
        <div class="hint">Ручной фикс или промо приоритетнее автоматики. Это значение уходит в выгрузку как рабочее.</div>
      </div>
      <div class="card repricer-guide-card">
        <div class="label">3. Массовые правила</div>
        <div class="value">Для групп SKU</div>
        <div class="hint">Настройки бренда, статуса и роли используем для группы SKU. Для одной карточки меняем решение в самой карточке.</div>
      </div>
    </div>
  `;
}

function renderRepricerSignalsCard(summaryBadges, techBadges, healthOk) {
  const isOpen = repricerUiToggleOpen('sections', 'techSignals', false);
  return `
    <div class="card" style="margin-top:12px">
      <div class="section-subhead">
        <div>
          <h3>Что проверить в первую очередь</h3>
          <p class="small muted">Сверху оставляем только сигналы для решения человеком. Подробные технические метрики модели раскрываются ниже.</p>
        </div>
        <div class="badge-stack">${healthOk ? badge('выгрузка: можно', 'ok') : badge('выгрузка: нужна проверка', 'warn')}</div>
      </div>
      <div class="badge-stack" style="margin-top:10px">${summaryBadges}</div>
      <details data-repricer-section="techSignals" ${isOpen ? 'open' : ''} style="margin-top:12px">
        <summary class="small muted" style="cursor:pointer">Техническая сводка модели</summary>
        <div class="badge-stack" style="margin-top:10px">${techBadges}</div>
        <div class="muted small" style="margin-top:10px">Эта сводка нужна для диагностики расчёта. Для ежедневной работы обычно достаточно сигналов выше и блока «Перед выгрузкой в Excel».</div>
      </details>
    </div>
  `;
}

function repricerTurnoverActionLabel(action = '') {
  const code = String(action || '').trim().toUpperCase();
  const map = {
    KEEP: 'оставить',
    UP: 'поднять',
    DOWN: 'снизить',
    HOLD: 'на удержании',
    FREEZE: 'заморозка',
    BLOCK: 'пауза по данным',
    OFF: 'вне контура',
    FORCE: 'ручной фикс',
    LAUNCH_HOLD: 'стоп до READY',
    OOS: 'поднять из-за OOS',
    PROMO: 'промо',
    PROMO_OFFER: 'акция'
  };
  return map[code] || (code ? code.toLowerCase() : 'оставить');
}

function repricerExplainSideAction(side) {
  const currentPrice = numberOrZero(side?.currentPrice);
  const finalPrice = numberOrZero(side?.finalPrice);
  const effectiveFloor = numberOrZero(side?.effectiveFloor);
  const capPrice = numberOrZero(side?.capPrice);
  const delta = finalPrice - currentPrice;
  if (side?.criticalGate === 'SKIP' || side?.reasonCode === 'NO_SPEC') {
    return {
      tone: 'warn',
      title: 'Вне контура',
      hint: 'По SKU не хватает спецификации. В выгрузку лучше не отправлять.'
    };
  }
  if (side?.criticalGate === 'BLOCK' || side?.reasonCode === 'BLOCK') {
    return {
      tone: 'danger',
      title: 'Пауза: не хватает входных данных',
      hint: 'Нужны текущая цена и рабочий MIN/себестоимость для расчёта.'
    };
  }
  if (side?.promoActive) {
    const promoLabel = side.promoSource === 'promo_offer' ? 'Акция ведёт цену' : 'Промо активно';
    const promoWindow = side.promoTo ? ` до ${side.promoTo}` : '';
    return {
      tone: side.promoSource === 'promo_offer' ? 'info' : 'warn',
      title: promoLabel,
      hint: `Финальная цена ${fmt.money(finalPrice)}${promoWindow}.`
    };
  }
  if (side?.reasonCode === 'FORCE' || side?.modeCode === 'FORCE') {
    return {
      tone: 'warn',
      title: 'Ручной фикс цены',
      hint: `Цена зафиксирована вручную: ${fmt.money(finalPrice)}.`
    };
  }
  if (side?.reasonCode === 'LAUNCH_HOLD') {
    return {
      tone: 'warn',
      title: 'Стоп до READY',
      hint: 'Новинка не в READY. Автоматический сдвиг цены не выполняется.'
    };
  }
  if (side?.turnoverAction === 'HOLD' || side?.turnoverAction === 'FREEZE') {
    return {
      tone: 'info',
      title: 'Цена на удержании',
      hint: `Оставляем ${fmt.money(finalPrice)} в текущем режиме управления.`
    };
  }
  if (side?.turnoverAction === 'OFF') {
    return {
      tone: 'info',
      title: 'Авторежим выключен',
      hint: 'Для этой площадки сейчас нет автоматического сдвига цены.'
    };
  }
  if (delta >= 1) {
    const floorHint = effectiveFloor > 0 && finalPrice <= effectiveFloor + 0.001 ? ' (до рабочего MIN)' : '';
    return {
      tone: 'warn',
      title: 'Нужно поднять цену',
      hint: `${fmt.money(currentPrice)} → ${fmt.money(finalPrice)}${floorHint}.`
    };
  }
  if (delta <= -1) {
    const capHint = capPrice > 0 && finalPrice >= capPrice - 0.001 ? ' (до MAX)' : '';
    return {
      tone: 'info',
      title: 'Можно снизить цену',
      hint: `${fmt.money(currentPrice)} → ${fmt.money(finalPrice)}${capHint}.`
    };
  }
  if (currentPrice > 0 && effectiveFloor > 0 && currentPrice + 0.001 < effectiveFloor) {
    return {
      tone: 'danger',
      title: 'Текущая цена ниже MIN',
      hint: `Нужно выйти минимум на ${fmt.money(effectiveFloor)}.`
    };
  }
  return {
    tone: 'ok',
    title: 'Оставить без изменений',
    hint: `Текущая цена ${fmt.money(currentPrice)} остаётся рабочей.`
  };
}

function renderRepricerArrivalSignal(side) {
  const signal = side?.arrivalPriceSignal;
  if (!signal?.hasMovement) return '';
  const title = signal.needsCheck
    ? 'Авто-сигнал: товар на площадке, проверить цену'
    : 'Авто-сигнал: товар на площадке, цена без красных флагов';
  const reason = signal.needsCheck
    ? signal.reasons.slice(0, 3).join(' · ')
    : 'Критичных причин для ручной проверки цены нет.';
  return `
    <div class="repricer-side-action ${escapeHtml(signal.tone || 'info')}" style="margin-top:10px">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(`${signal.stockLabel}${reason ? ` · ${reason}` : ''}`)}</span>
    </div>
  `;
}

function renderRepricerSide(title, side) {
  if (!side) {
    return `<div class="repricer-side"><div class="repricer-side-head">${escapeHtml(title)}</div><div class="muted small">Нет данных по площадке.</div></div>`;
  }
  const override = side.override || null;
  const corridor = side.corridor || null;
  const displayedCap = numberOrZero(side.finalGuardCap) > 0
    ? numberOrZero(side.finalGuardCap)
    : numberOrZero(side.capPrice || side.stretchCap);
  const manualCap = numberOrZero(side.capPrice);
  const floorForCapGuard = Math.max(numberOrZero(side.finalGuardFloor), numberOrZero(side.effectiveFloor));
  const capLiftedByFloorGuard = manualCap > 0 && floorForCapGuard > 0 && manualCap + 0.001 < floorForCapGuard;
  const action = repricerExplainSideAction(side);
  const confidenceBadge = badge(`${repricerConfidenceLabel(side.confidence)} ${fmt.int(side.confidenceScore)}`, repricerConfidenceTone(side.confidence));
  const lifecycleBadge = side.productLifecycleKey && side.productLifecycleKey !== 'active'
    ? badge(`товар: ${side.productLifecycleLabel || side.productLifecycleKey}`, side.productLifecycleTone || 'warn')
    : '';
  const businessBadges = [
    side.requiredMarginPct == null ? '' : badge(`Маржа ≥ ${fmt.pct(side.requiredMarginPct)}`, side.marginRisk ? 'danger' : 'ok'),
    numberOrZero(side.marginFloor) > 0 ? badge(`floor маржи ${fmt.money(side.marginFloor)}`, side.marginPriorityApplied ? 'warn' : 'info') : '',
    numberOrZero(side.costRub) > 0 ? badge(`себестоимость ${fmt.money(side.costRub)}`, 'info') : '',
    numberOrZero(side.platformCostsRub) > 0 ? badge(`площадка ${fmt.money(side.platformCostsRub)}`, 'info') : '',
    numberOrZero(side.internalAdvertisingPctValue) > 0 ? badge(`внутр. реклама ${fmt.pct(side.internalAdvertisingPctValue)}`, 'info') : '',
    numberOrZero(side.internalAdvertisingRub) > 0 ? badge(`внутр. реклама ${fmt.money(side.internalAdvertisingRub)}`, 'info') : '',
    badge(`MIN ${fmt.money(side.effectiveFloor)}`, side.belowFloorNow ? 'danger' : ''),
    badge(`MAX ${fmt.money(displayedCap)}`),
    side.capLiftedByMargin ? badge(`MAX поднят до маржи ${fmt.money(displayedCap)}`, 'warn') : (capLiftedByFloorGuard ? badge(`MAX поднят до MIN ${fmt.money(displayedCap)}`, 'warn') : ''),
    badge(`оборот ${fmt.num(side.turnoverDays, 1)} дн.`, side.lowStockRisk ? 'warn' : ''),
    side.marginPct == null ? '' : badge(`факт маржи ${fmt.pct(side.marginPct)}`, side.marginRisk ? 'danger' : 'ok'),
    side.arrivalPriceSignal?.hasMovement ? badge(`приход: ${side.arrivalPriceSignal.stockLabel}`, side.arrivalPriceSignal.needsCheck ? 'warn' : 'ok') : '',
    side.promoActive ? badge(`${side.promoSource === 'promo_offer' ? 'акция' : 'промо'} ${fmt.money(side.promoPrice)}`, side.promoSource === 'promo_offer' ? 'info' : 'warn') : '',
    side.hasLiveBenchmark ? badge(`live ${fmt.money(side.liveReferencePrice)}`, side.liveDrift ? 'warn' : 'info') : ''
  ].filter(Boolean).join('');
  const summaryBadges = [
    confidenceBadge,
    lifecycleBadge,
    badge(`действие: ${repricerTurnoverActionLabel(side.turnoverAction)}`, side.criticalGate === 'BLOCK' ? 'danger' : 'info'),
    side.autopriceAllowed ? badge('авторежим: включен', 'ok') : badge('авторежим: выключен', 'warn'),
    side.economicFloorSource === 'snapshot_fallback' ? badge('fallback экономика', 'info') : badge('себестоимость: есть', 'ok'),
    side.launchHold ? badge('стоп до READY', 'warn') : '',
    side.hasOverride ? badge('ручное решение', 'warn') : ''
  ].filter(Boolean).join('');
  const techBadges = [
    badge(`роль ${side.role || '—'}`, 'info'),
    badge(`launch ${side.launchReady || '—'}`, side.launchHold ? 'warn' : ''),
    badge(`reason ${side.reasonCode || 'KEEP'}`, side.reasonCode === 'BLOCK' ? 'danger' : 'info'),
    side.finalReasonCode && !side.promoActive ? badge(`final ${side.finalReasonCode}`, side.alignmentApplied ? 'ok' : 'info') : '',
    badge(side.economicFloorSource === 'fee_stack' ? 'экономика: полная' : side.economicFloorSource === 'snapshot_guard' ? 'экономика: guard' : 'экономика: fallback', side.economicFloorSource === 'snapshot_fallback' ? 'warn' : 'info'),
    side.engineModeCode === 'LAUNCH' ? (side.launchAllowed ? badge('launch rule: on', 'ok') : badge('launch rule: off', 'warn')) : '',
    side.volumePushAllowed ? badge('volume push', 'info') : badge('защита маржи', 'ok'),
    side.allowAlignment ? badge('alignment: on', 'ok') : badge('alignment: off', 'warn'),
    side.promoConfigured ? badge(side.promoActive ? (side.promoAdjustedToFloor ? `${side.promoSource === 'promo_offer' ? 'акция' : 'промо'} + floor guard` : `${side.promoSource === 'promo_offer' ? 'акция' : 'промо'} fixed`) : repricerPromoWindowLabel({ status: side.promoWindowStatus }, side.promoSource === 'promo_offer' ? 'offer' : 'promo'), side.promoSource === 'promo_offer' ? 'info' : (side.promoActive ? 'warn' : 'info')) : '',
    side.liveDeltaPct == null ? '' : badge(`к live ${side.liveDeltaPct > 0 ? '+' : ''}${fmt.pct(side.liveDeltaPct)}`, side.liveDrift ? 'warn' : 'ok')
  ].filter(Boolean).join('');
  const controlsKey = `${String(side.articleKey || '').trim()}::${String(side.platform || '').trim()}`;
  const controlsOpen = repricerUiToggleOpen('controls', controlsKey, false);
  return `
    <div class="repricer-side ${side.changed ? 'changed' : ''} confidence-${escapeHtml(side.confidence || '')}" data-lifecycle-key="${escapeHtml(side.productLifecycleKey || 'active')}" data-lifecycle-mode="${escapeHtml(side.engineMode || side.mode || 'auto')}">
      <div class="repricer-side-head">${escapeHtml(title)} <span class="badge-stack">${confidenceBadge}${lifecycleBadge}${badge(repricerModeLabel(side.mode), repricerModeTone(side.mode))}${side.arrivalPriceSignal?.needsCheck ? badge('пришёл: проверить цену', side.arrivalPriceSignal.tone || 'warn') : (side.arrivalPriceSignal?.hasMovement ? badge('товар на площадке', 'ok') : '')}${side.manualPromoConfigured ? badge(repricerPromoWindowLabel({ status: side.manualPromoWindowStatus }), side.manualPromoActive ? 'warn' : 'info') : ''}${side.promoOfferConfigured ? badge(repricerPromoWindowLabel({ status: side.promoOfferWindowStatus }, 'offer'), side.promoSource === 'promo_offer' && side.promoActive ? 'info' : 'warn') : ''}${side.promoSource === 'promo_offer' ? badge('акция ведёт цену', 'info') : ''}${side.hasOverride ? badge('ручное решение', 'warn') : ''}${side.hasCorridor ? badge('коридор', 'info') : ''}${side.alignmentApplied ? badge('выравнивание', 'info') : ''}</span></div>
      <div class="repricer-prices">
        <div><span>Текущая</span><strong>${fmt.money(side.currentPrice)}</strong></div>
        <div><span>Финал</span><strong>${fmt.money(side.finalPrice)}</strong></div>
        <div><span>Δ</span><strong>${side.changePct == null ? '—' : fmt.pct(side.changePct)}</strong></div>
      </div>
      <div class="repricer-side-action ${escapeHtml(action.tone)}" style="margin-top:10px">
        <strong>${escapeHtml(action.title)}</strong>
        <span>${escapeHtml(side.decisionText || action.hint)}</span>
      </div>
      ${renderRepricerArrivalSignal(side)}
      <div class="badge-stack" style="margin-top:8px">
        ${businessBadges}
      </div>
      <div class="badge-stack" style="margin-top:8px">
        ${summaryBadges}
      </div>
      <div class="muted small" style="margin-top:8px"><strong>${escapeHtml(side.strategy || 'Стратегия не определена')}</strong></div>
      <div class="muted small" style="margin-top:6px">${escapeHtml(side.reason || 'Причина не указана')}${Array.isArray(side.confidenceReasons) && side.confidenceReasons.length ? ` · проверка: ${escapeHtml(side.confidenceReasons.join(' · '))}` : ''}</div>
      ${renderRepricerHistoryBlock(side)}
      <details data-repricer-controls="${escapeHtml(controlsKey)}" ${controlsOpen ? 'open' : ''} style="margin-top:10px">
        <summary class="small muted" style="cursor:pointer">Управление площадкой</summary>
        ${controlsOpen ? `
        <div class="muted small" style="margin-top:10px">MIN/MAX из вкладки «Цены» попадают сюда автоматически как ручные границы. Здесь уже управляем точечным решением по этой площадке.</div>
        <div class="muted small" style="margin-top:8px">Engine: ${escapeHtml(side.engineModeCode || 'AUTO')} · Gate: ${escapeHtml(side.criticalGate || 'OK')} · Stock flag: ${escapeHtml(side.oosFlag || '—')} · Sales7d: ${fmt.num(side.sales7d, 1)} · buyer factor: ${fmt.num(side.buyerDiscountFactor, 3)}</div>
        <div class="badge-stack" style="margin-top:8px">${techBadges}</div>
        <div class="badge-stack" style="margin-top:8px">${badge(`до выравнивания ${fmt.money(side.preAlignPrice)}`, 'info')}${badge(`после ограничений ${fmt.money(side.cappedPrice)}`, 'info')}${badge(`экон. MIN ${fmt.money(side.economicFloor)}`, side.economicFloorSource === 'snapshot_fallback' ? 'warn' : 'ok')}</div>
        <form class="repricer-corridor-form" data-article-key="${escapeHtml(side.articleKey)}" data-platform="${escapeHtml(side.platform)}" style="margin-top:10px">
          <div class="filters repricer-filters">
            <input type="number" step="1" min="0" name="hardFloor" value="${escapeHtml(corridor?.hardFloor ?? '')}" placeholder="Жёсткий MIN, ₽">
            <input type="number" step="1" min="0" name="b2bFloor" value="${escapeHtml(corridor?.b2bFloor ?? '')}" placeholder="B2B MIN, ₽">
            <input type="number" step="1" min="0" name="basePrice" value="${escapeHtml(corridor?.basePrice ?? '')}" placeholder="База, ₽">
            <input type="number" step="1" min="0" name="stretchCap" value="${escapeHtml(corridor?.stretchCap ?? '')}" placeholder="MAX, ₽">
            <input type="number" step="1" min="0" name="promoFloor" value="${escapeHtml(corridor?.promoFloor ?? '')}" placeholder="Promo MIN, ₽">
            <input type="number" step="0.1" name="elasticity" value="${escapeHtml(corridor?.elasticity ?? '')}" placeholder="Эластичность">
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
              <option value="off" ${override?.mode === 'off' ? 'selected' : ''}>Off</option>
            </select>
            <input type="number" step="1" min="0" name="floorPrice" value="${escapeHtml(override?.floorPrice ?? '')}" placeholder="Ручной MIN, ₽">
            <input type="number" step="1" min="0" name="capPrice" value="${escapeHtml(override?.capPrice ?? '')}" placeholder="Ручной MAX, ₽">
            <input type="number" step="1" min="0" name="forcePrice" value="${escapeHtml(override?.forcePrice ?? '')}" placeholder="Фикс-цена, ₽">
          </div>
          <div class="filters repricer-filters" style="margin-top:8px">
            <label class="muted small" style="display:flex; align-items:center; gap:8px">
              <input type="checkbox" name="promoActive" ${override?.promoActive ? 'checked' : ''}>
              Акционная цена
            </label>
            <input type="number" step="1" min="0" name="promoPrice" value="${escapeHtml(override?.promoPrice ?? '')}" placeholder="Акционная цена, ₽">
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
            <button type="submit" class="quick-chip">Сохранить ручное решение</button>
            <button type="button" class="quick-chip" data-repricer-reset data-article-key="${escapeHtml(side.articleKey)}" data-platform="${escapeHtml(side.platform)}">Сбросить ручное решение</button>
          </div>
        </form>
        ` : '<div class="muted small" style="margin-top:10px">Откройте, если нужно вручную задать коридор, промо или фикс-цену.</div>'}
      </details>
    </div>
  `;
}

function persistRepricerState() {
  invalidateRepricerRowsCache();
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
  const globalCard = form.querySelector('[data-repricer-global-card]');
  const brandRules = {};
  form.querySelectorAll('[data-repricer-brand-card]').forEach((card) => {
    const brand = repricerCanonicalBrandName(card.getAttribute('data-repricer-brand-card') || '');
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
      adPct: card.querySelector('[name="adPct"]')?.value,
      adRub: card.querySelector('[name="adRub"]')?.value,
      returnsRub: card.querySelector('[name="returnsRub"]')?.value,
      otherRub: card.querySelector('[name="otherRub"]')?.value
    });
  });
  state.storage.repricerSettings = normalizeRepricerSettings({
    global: {
      minMarginPct: globalCard?.querySelector('[name="minMarginPct"]')?.value,
      defaultTargetDays: globalCard?.querySelector('[name="defaultTargetDays"]')?.value,
      launchTargetDays: globalCard?.querySelector('[name="launchTargetDays"]')?.value,
      oosDays: globalCard?.querySelector('[name="oosDays"]')?.value,
      alignmentEnabled: globalCard?.querySelector('[name="alignmentEnabled"]')?.checked,
      deadbandPct: globalCard?.querySelector('[name="deadbandPct"]')?.value,
      deadbandRub: globalCard?.querySelector('[name="deadbandRub"]')?.value
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
  const currentRow = buildRepricerRows().find((item) => String(item.articleKey || '').trim() === articleKey) || null;
  const currentLifecycleKey = repricerLifecycleKey(currentRow?.productLifecycle?.key || currentRow?.status || '');
  const requestedLifecycleKey = repricerLifecycleKey(form.status?.value || '');
  if (requestedLifecycleKey && currentLifecycleKey && requestedLifecycleKey !== currentLifecycleKey) {
    window.alert('Статус здесь напрямую не меняется. Используйте блок «Статус товара» выше: он создаст задачу РОПу и применит статус только после подтверждения.');
    return false;
  }
  const next = normalizeRepricerSkuProfile({
    articleKey,
    status: '',
    role: form.role.value,
    launchReady: form.launchReady.value,
    targetMarginPct: form.targetMarginPct?.value,
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
  return true;
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
    repricerQueueMinMaxTask({
      articleKey,
      platform,
      min: Math.max(numberOrZero(next.hardFloor), numberOrZero(next.b2bFloor)),
      max: next.stretchCap,
      note: 'Ручное сохранение коридора MIN/MAX',
      requestedAt: next.updatedAt
    });
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
    repricerQueueMinMaxTask({
      articleKey,
      platform,
      min: next.floorPrice,
      max: next.capPrice,
      note: next.note || 'Ручное сохранение MIN/MAX',
      requestedAt: next.updatedAt
    });
  } else {
    markRepricerDeleteTombstone('repricerOverrideDeletes', articleKey, platform, true);
  }
  persistRepricerState();
}

const REPRICER_SHARP_PRICE_APPROVAL_PCT = REPRICER_SHARP_PRICE_APPROVAL_THRESHOLD_PCT;

function repricerRequestedExactPrice(override = {}) {
  if (override.promoActive && numberOrZero(override.promoPrice) > 0) return numberOrZero(override.promoPrice);
  if (override.mode === 'force' && numberOrZero(override.forcePrice) > 0) return numberOrZero(override.forcePrice);
  return 0;
}

function repricerCurrentSideForApproval(articleKey = '', platform = 'all') {
  const row = buildRepricerRows().find((item) => String(item?.articleKey || '').trim() === String(articleKey || '').trim());
  return platform === 'ozon' ? row?.ozon || null : row?.wb || null;
}

function repricerSharpPriceChange(currentPrice, requestedPrice) {
  const current = numberOrZero(currentPrice);
  const requested = numberOrZero(requestedPrice);
  if (current <= 0 || requested <= 0) return null;
  const deltaPct = (requested - current) / current;
  return Math.abs(deltaPct) + 1e-9 >= REPRICER_SHARP_PRICE_APPROVAL_PCT ? deltaPct : null;
}

async function requestRepricerSharpPriceApproval(next, side, deltaPct, options = {}) {
  if (typeof window.requestSkuDecisionApproval !== 'function') {
    throw new Error('Модуль согласования РОПа не загружен; резкая цена не применена.');
  }
  const requestedPrice = repricerRequestedExactPrice(next);
  const reason = String(next.note || next.promoLabel || '').trim();
  if (!reason) throw new Error('Для резкого изменения цены укажите комментарий с основанием.');
  const decision = await window.requestSkuDecisionApproval({
    type: 'SHARP_PRICE_CHANGE',
    articleKey: next.articleKey,
    platform: next.platform,
    currentValue: Math.round(numberOrZero(side?.currentPrice)),
    proposedValue: Math.round(requestedPrice),
    reason,
    payload: {
      currentPrice: numberOrZero(side?.currentPrice),
      requestedPrice,
      deltaPct,
      thresholdPct: REPRICER_SHARP_PRICE_APPROVAL_PCT,
      autoGenerated: Boolean(options.autoGenerated),
      override: next
    },
    metrics: {
      currentMarginPct: side?.marginPct ?? null,
      requiredMarginPct: side?.requiredMarginPct ?? null,
      marginFloor: side?.marginFloor ?? null,
      minPrice: side?.effectiveFloor ?? side?.minPrice ?? null,
      maxPrice: side?.finalGuardCap ?? side?.capPrice ?? null,
      turnoverDays: side?.turnoverDays ?? null,
      stock: side?.stock ?? null
    }
  });
  if (!options.silent) {
    window.alert(decision.duplicate
      ? 'Такая цена уже ждёт решения РОПа. Рабочая цена не изменена.'
      : 'Резкая цена не применена. РОПу создана задача на подтверждение.');
  }
  return decision;
}

const REPRICER_AUTO_SHARP_APPROVAL_SYNC = {
  signature: '',
  running: false,
  scheduled: false
};

function repricerAutomaticSharpPriceCandidates(rows = []) {
  const candidates = [];
  const seen = new Set();
  repricerCollectSides(rows).forEach(({ row, side }) => {
    if (!side?.sharpPriceAutoTaskEligible || side.sharpPriceApprovalPending) return;
    const currentPrice = numberOrZero(side.currentPrice);
    const requestedPrice = Math.round(numberOrZero(side.finalPrice ?? side.recommendedPrice));
    if (currentPrice <= 0 || requestedPrice <= 0) return;
    const deltaPct = (requestedPrice - currentPrice) / currentPrice;
    if (Math.abs(deltaPct) + 1e-9 < REPRICER_SHARP_PRICE_APPROVAL_PCT) return;
    const articleKey = String(side.articleKey || row?.articleKey || row?.article || '').trim();
    const platform = String(side.platform || '').trim().toLowerCase();
    const key = `${articleKey}|${platform}|${requestedPrice}`;
    if (!articleKey || !platform || seen.has(key)) return;
    seen.add(key);
    candidates.push({ row, side, articleKey, platform, currentPrice, requestedPrice, deltaPct, key });
  });
  return candidates.slice(0, 250);
}

async function syncRepricerAutomaticSharpPriceApprovals(rows = buildRepricerRows()) {
  if (window.__REPRICER_TEST_DISABLE_AUTO_APPROVAL_SYNC__) return { created: 0, duplicates: 0, skipped: 0 };
  if (REPRICER_AUTO_SHARP_APPROVAL_SYNC.running) return { created: 0, duplicates: 0, skipped: 0, running: true };
  const candidates = repricerAutomaticSharpPriceCandidates(rows);
  const signature = candidates.map((item) => item.key).sort().join('||');
  if (!signature || signature === REPRICER_AUTO_SHARP_APPROVAL_SYNC.signature) {
    return { created: 0, duplicates: 0, skipped: candidates.length };
  }
  if (typeof window.requestSkuDecisionApproval !== 'function') {
    return { created: 0, duplicates: 0, skipped: candidates.length, unavailable: true };
  }
  REPRICER_AUTO_SHARP_APPROVAL_SYNC.running = true;
  const summary = { created: 0, duplicates: 0, skipped: 0 };
  try {
    for (const candidate of candidates) {
      const note = [
        'Автопредложение репрайсера: изменение цены не менее 10%.',
        `${fmt.money(candidate.currentPrice)} → ${fmt.money(candidate.requestedPrice)}.`,
        candidate.side.reason || candidate.side.decisionText || ''
      ].filter(Boolean).join(' ');
      const next = normalizeRepricerOverride({
        articleKey: candidate.articleKey,
        platform: candidate.platform,
        mode: 'force',
        forcePrice: candidate.requestedPrice,
        note,
        updatedAt: new Date().toISOString(),
        updatedBy: 'Репрайсер'
      });
      try {
        const decision = await requestRepricerSharpPriceApproval(next, candidate.side, candidate.deltaPct, {
          silent: true,
          autoGenerated: true
        });
        if (decision?.duplicate) summary.duplicates += 1;
        else summary.created += 1;
      } catch (error) {
        summary.skipped += 1;
        console.error('[repricer.autoSharpApproval]', candidate.key, error);
      }
    }
    REPRICER_AUTO_SHARP_APPROVAL_SYNC.signature = signature;
    invalidateRepricerRowsCache();
    return summary;
  } finally {
    REPRICER_AUTO_SHARP_APPROVAL_SYNC.running = false;
  }
}

function scheduleRepricerAutomaticSharpPriceApprovals(rows = []) {
  if (window.__REPRICER_TEST_DISABLE_AUTO_APPROVAL_SYNC__) return;
  if (REPRICER_AUTO_SHARP_APPROVAL_SYNC.scheduled) return;
  REPRICER_AUTO_SHARP_APPROVAL_SYNC.scheduled = true;
  setTimeout(() => {
    REPRICER_AUTO_SHARP_APPROVAL_SYNC.scheduled = false;
    syncRepricerAutomaticSharpPriceApprovals(rows).catch((error) => console.error('[repricer.autoSharpApproval.sync]', error));
  }, 0);
}

window.repricerAutomaticSharpPriceCandidates = repricerAutomaticSharpPriceCandidates;
window.syncRepricerAutomaticSharpPriceApprovals = syncRepricerAutomaticSharpPriceApprovals;

async function saveRepricerOverride(form) {
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
  const requestedPrice = repricerRequestedExactPrice(next);
  const side = requestedPrice > 0 ? repricerCurrentSideForApproval(articleKey, platform) : null;
  const deltaPct = repricerSharpPriceChange(side?.currentPrice, requestedPrice);
  if (deltaPct !== null) {
    try {
      await requestRepricerSharpPriceApproval(next, side, deltaPct);
    } catch (error) {
      console.error(error);
      window.alert(error?.message || 'Не удалось создать задачу РОПу. Цена не применена.');
    }
    renderRepricer();
    return;
  }
  upsertRepricerOverride(next);
}

function resetRepricerOverride(articleKey, platform) {
  state.storage.repricerOverrides = (state.storage.repricerOverrides || []).filter((item) => !(item.articleKey === articleKey && item.platform === platform));
  markRepricerDeleteTombstone('repricerOverrideDeletes', articleKey, platform, true);
  persistRepricerState();
}

async function applyRepricerPromoOffer(articleKey, platform) {
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
  const deltaPct = repricerSharpPriceChange(side.currentPrice, next.promoPrice);
  if (deltaPct !== null) {
    try {
      await requestRepricerSharpPriceApproval(next, side, deltaPct);
    } catch (error) {
      console.error(error);
      window.alert(error?.message || 'Не удалось создать задачу РОПу. Акционная цена не применена.');
    }
    renderRepricer();
    return;
  }
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

function repricerPrimaryStopReason(side) {
  if (!side) return 'нет стороны';
  if (side.outOfSpec || side.criticalGate === 'SKIP') return 'вне спецификации';
  if (side.marginPolicyMissing) return 'нет маржи SKU';
  if (side.criticalGate === 'BLOCK') return 'нет входов';
  const flags = repricerIssueFlags(side);
  if (flags.missingPrice) return 'нет цены';
  if (flags.missingMin) return 'нет MIN';
  if (flags.belowMin) return 'ниже MIN';
  if (flags.fallbackEconomy) return 'fallback экономика';
  if (!side.rawCostPresent && side.economicFloorSource === 'snapshot_fallback') return 'fallback экономика';
  if (side.marginRisk) return 'риск маржи';
  if (side.launchHold === 'LAUNCH_HOLD') return 'не READY';
  if (side.arrivalPriceSignal?.needsCheck) return 'пришёл → цена';
  if (side.cooldownActive) return 'cooldown';
  if (side.stepLimited) return 'лимит шага';
  if (side.promoConfigured && !side.promoActive) return 'промо вне окна';
  if (side.liveDrift) return 'расходится с live';
  if (Array.isArray(side.confidenceReasons) && side.confidenceReasons.length) return side.confidenceReasons[0];
  return '';
}

function repricerIssueFlags(side) {
  const deferredPricing = repricerDeferredPricingSide(side);
  return {
    missingMargin: Boolean(side?.marginPolicyMissing),
    missingMin: numberOrZero(side?.effectiveFloor) <= 0 && !deferredPricing,
    missingCost: numberOrZero(side?.costRub) <= 0 && !side?.pricingProxyPresent && !deferredPricing,
    fallbackEconomy: !side?.rawCostPresent && side?.economicFloorSource === 'snapshot_fallback' && Boolean(side?.pricingProxyPresent),
    missingPrice: numberOrZero(side?.currentPrice) <= 0 && !deferredPricing,
    belowMin: repricerBelowMinNeedsManual(side),
    liveDrift: Boolean(side?.liveDrift),
    marginRisk: Boolean(side?.marginRisk),
    blocked: side?.criticalGate === 'BLOCK',
    notReady: side?.launchHold === 'LAUNCH_HOLD',
    promoWindow: Boolean(side?.promoConfigured && !side?.promoActive)
  };
}

function repricerFixSource(side) {
  const flags = repricerIssueFlags(side);
  if (flags.missingMargin) return 'SKU / маржа';
  if (flags.missingMin || flags.belowMin) return 'Цены';
  if (flags.missingCost) return 'Себестоимость';
  if (flags.missingPrice) return 'Маркетплейс / текущая цена';
  if (side?.arrivalPriceSignal?.needsCheck) return 'WB/Ozon приход';
  if (flags.notReady) return 'SKU';
  if (flags.liveDrift || flags.marginRisk || flags.blocked || flags.promoWindow) return 'Ручное решение';
  return 'Аудит';
}

function repricerFixAction(side) {
  const flags = repricerIssueFlags(side);
  if (flags.missingMargin) return 'заполнить обязательную маржу SKU';
  if (flags.missingMin) return 'заполнить рабочий MIN/MAX';
  if (flags.belowMin) return 'поднять цену до MIN или пересмотреть MIN';
  if (flags.missingCost) return 'добавить себестоимость / fee stack';
  if (flags.missingPrice) return 'обновить текущую цену площадки';
  if (side?.arrivalPriceSignal?.needsCheck) return 'проверить цену после прихода/отгрузки';
  if (flags.liveDrift) return 'сверить live-рекомендацию с финальной ценой';
  if (flags.marginRisk) return 'поднять цену или пересмотреть маржинальный порог';
  if (flags.notReady) return 'перевести launch статус в READY или оставить HOLD';
  if (flags.promoWindow) return 'проверить даты промо';
  if (flags.blocked) return 'разобрать обязательные входы';
  return 'проверить строку в аудите';
}

function repricerFixProposal(side) {
  const flags = repricerIssueFlags(side);
  const floor = numberOrZero(side?.effectiveFloor);
  const current = numberOrZero(side?.currentPrice);
  const finalPrice = numberOrZero(side?.finalPrice);
  const livePrice = numberOrZero(side?.liveReferencePrice);
  if (flags.missingMargin) return 'предложение без записи: утвердить маржу SKU и загрузить её через аудит';
  if (flags.missingMin) return current > 0
    ? `предложение без записи: проверить и заполнить MIN в «Цены» около текущей цены ${fmt.money(current)}`
    : 'предложение без записи: заполнить MIN/MAX после проверки карточки';
  if (flags.belowMin) return floor > 0
    ? `предложение без записи: поднять цену не ниже ${fmt.money(floor)} или подтвердить новый MIN`
    : 'предложение без записи: перепроверить рабочий MIN';
  if (flags.missingCost) return 'предложение без записи: добавить себестоимость и комиссии, затем пересчитать выгрузку цен';
  if (flags.missingPrice) return 'предложение без записи: обновить price snapshot и не выгружать цену до появления текущей цены';
  if (side?.arrivalPriceSignal?.needsCheck) return `предложение без записи: проверить цену по приходу (${side.arrivalPriceSignal.reasons.slice(0, 3).join(' · ')})`;
  if (flags.liveDrift) return livePrice > 0
    ? `предложение без записи: сравнить финал ${fmt.money(finalPrice)} с live ${fmt.money(livePrice)}`
    : 'предложение без записи: сверить live repricer перед выгрузкой';
  if (flags.marginRisk) return floor > 0
    ? `предложение без записи: держать цену не ниже economic floor ${fmt.money(floor)}`
    : 'предложение без записи: поднять цену до безопасной маржи';
  if (flags.notReady) return 'предложение без записи: оставить HOLD до готовности запуска';
  if (flags.promoWindow) return 'предложение без записи: поправить даты промо или отключить промо-цену';
  if (flags.blocked) return 'предложение без записи: сначала закрыть обязательные входы, затем пересчитать';
  return side?.decisionText ? `предложение без записи: ${side.decisionText}` : 'предложение без записи: нужна ручная проверка';
}

function repricerCommandHint(side) {
  const flags = repricerIssueFlags(side);
  if (side?.outOfSpec || side?.criticalGate === 'SKIP') return 'УДАЛИТЬ';
  if (flags.missingMargin) return 'ИСПРАВИТЬ + МАРЖА';
  if (flags.belowMin) return 'ИСПРАВИТЬ или FORCE';
  if (flags.missingMin) return 'ИСПРАВИТЬ + MIN';
  if (flags.missingCost) return 'ИСПРАВИТЬ + себестоимость';
  if (flags.missingPrice) return 'HOLD';
  if (side?.arrivalPriceSignal?.needsCheck) return 'ПРОВЕРИТЬ ЦЕНУ';
  if (flags.notReady) return 'HOLD или READY';
  if (flags.marginRisk) return 'ИСПРАВИТЬ';
  if (flags.liveDrift) return 'ИСПРАВИТЬ или HOLD';
  if (flags.promoWindow) return 'ИСПРАВИТЬ промо';
  return side?.confidence === 'green' ? 'оставить пусто' : 'ИСПРАВИТЬ';
}

function repricerRecommendedAction(side) {
  const flags = repricerIssueFlags(side);
  const floor = numberOrZero(side?.effectiveFloor);
  const current = numberOrZero(side?.currentPrice);
  if (side?.outOfSpec || side?.criticalGate === 'SKIP') return 'Удалить/выключить: позиция вне ценового контура.';
  if (flags.missingMargin) return 'Заполнить утверждённую маржу SKU; до этого цену не выгружать.';
  if (flags.belowMin && floor > 0) return `Поднять до ${fmt.money(floor)}: текущая цена ниже рабочего MIN.`;
  if (flags.missingMin) return current > 0 ? `Заполнить MIN около ${fmt.money(current)} после проверки карточки.` : 'Заполнить MIN/MAX после проверки карточки.';
  if (flags.missingCost) return 'Добавить себестоимость / fee stack в API, до этого не выгружать цену.';
  if (flags.missingPrice) return 'Обновить текущую цену из маркетплейса, до этого держать HOLD.';
  if (side?.arrivalPriceSignal?.needsCheck) return `Проверить цену по приходу: ${side.arrivalPriceSignal.reasons.slice(0, 3).join(' · ')}.`;
  if (flags.marginRisk) return floor > 0 ? `Держать цену не ниже ${fmt.money(floor)} и проверить маржу.` : 'Поднять цену или пересмотреть порог маржи.';
  if (flags.liveDrift) return 'Сверить live-рекомендацию с финальной ценой перед выгрузкой.';
  if (flags.notReady) return 'Оставить HOLD до READY или изменить launch статус.';
  if (flags.promoWindow) return 'Проверить окно промо или выключить промо-цену.';
  return side?.decisionText || 'Проверить строку и оставить пустой Команду, если менять ничего не нужно.';
}

function repricerFixTeamKey(side) {
  const flags = repricerIssueFlags(side);
  if (side?.outOfSpec || side?.criticalGate === 'SKIP') return 'api';
  if (flags.missingMargin) return 'sku';
  if (flags.missingMin || flags.belowMin) return 'prices';
  if (flags.missingCost) return 'cost';
  if (flags.missingPrice) return 'marketplace';
  if (side?.arrivalPriceSignal?.needsCheck) return 'marketplace';
  if (flags.notReady) return 'sku';
  if (flags.liveDrift || flags.marginRisk || flags.promoWindow || flags.blocked) return 'manual';
  return 'audit';
}

function repricerFixTeamLabel(team) {
  const map = {
    prices: 'Цены',
    cost: 'Себестоимость',
    api: 'API',
    marketplace: 'Маркетплейс',
    sku: 'SKU',
    manual: 'Ручное решение',
    audit: 'Аудит'
  };
  return map[team] || map.audit;
}

function repricerPriceTrace(row, side) {
  const parts = [
    `текущая ${fmt.money(side?.currentPrice)}`,
    `MIN ${fmt.money(side?.effectiveFloor)}`,
    numberOrZero(side?.capPrice || side?.stretchCap) > 0 ? `MAX ${fmt.money(side.capPrice || side.stretchCap)}` : '',
    `финал ${fmt.money(side?.finalPrice)}`,
    `confidence ${repricerConfidenceLabel(side?.confidence)} ${fmt.int(side?.confidenceScore)}`,
    side?.safeToExport || side?.promoSafeToExport ? 'в файл: да' : 'в файл: нет'
  ].filter(Boolean);
  if (side?.decisionText) parts.push(side.decisionText);
  return `${row?.article || row?.articleKey || ''}: ${parts.join(' → ')}`;
}

function repricerFixTeamCounts(rows = buildRepricerRows()) {
  const counts = {};
  repricerCollectSides(rows).forEach(({ side }) => {
    if (!side || side.confidence === 'green') return;
    const key = repricerFixTeamKey(side);
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function repricerIssueBatch(side) {
  const flags = repricerIssueFlags(side);
  if (flags.missingMargin) return 'missing_margin';
  if (flags.missingMin) return 'missing_min';
  if (flags.missingCost) return 'missing_cost';
  if (flags.belowMin) return 'below_min';
  if (flags.liveDrift) return 'live_drift';
  if (flags.marginRisk) return 'margin_risk';
  if (flags.missingPrice) return 'missing_price';
  return 'other';
}

function repricerIssueBatchLabel(batch) {
  const map = {
    all: 'стоп-лист',
    missing_margin: 'нет маржи SKU',
    missing_min: 'нет MIN',
    missing_cost: 'нет себестоимости',
    below_min: 'ниже MIN',
    live_drift: 'live расходится',
    margin_risk: 'риск маржи',
    missing_price: 'нет цены',
    other: 'прочее'
  };
  return map[batch] || map.all;
}

function repricerStopReasonSummary(sideRows) {
  const counts = {};
  (sideRows || []).forEach((item) => {
    const side = item?.side || item;
    const key = repricerPrimaryStopReason(side);
    if (!key) return;
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .map(([label, count]) => ({ label, count }));
}

function repricerHealthcheck(rows, platform = 'all') {
  const sideRows = repricerCollectSides(rows, platform);
  const activeSideRows = sideRows.filter(({ side }) => !side.outOfSpec);
  const stopReasons = repricerStopReasonSummary(activeSideRows.filter(({ side }) => side.confidence !== 'green'));
  const smokeTests = repricerRunWorkbookSmokeTests(normalizeRepricerSettings(state.storage?.repricerSettings || {}));
  const metrics = {
    sku_count: rows.length,
    side_rows: sideRows.length,
    out_of_spec_rows: sideRows.filter(({ side }) => side.outOfSpec).length,
    blocked_gate: activeSideRows.filter(({ side }) => side.criticalGate === 'BLOCK').length,
    missing_required_margin: activeSideRows.filter(({ side }) => side.marginPolicyMissing).length,
    missing_current_price: activeSideRows.filter(({ side }) => numberOrZero(side.currentPrice) <= 0).length,
    missing_current_price_actionable: activeSideRows.filter(({ side }) => numberOrZero(side.currentPrice) <= 0 && !repricerDeferredPricingSide(side)).length,
    missing_cost: activeSideRows.filter(({ side }) => numberOrZero(side.costRub) <= 0).length,
    protected_without_cost: activeSideRows.filter(({ side }) => !side.rawCostPresent && side.pricingProxyPresent && numberOrZero(side.effectiveFloor) > 0).length,
    missing_cost_actionable: activeSideRows.filter(({ side }) => numberOrZero(side.costRub) <= 0 && !side.pricingProxyPresent && !repricerDeferredPricingSide(side)).length,
    missing_effective_floor: activeSideRows.filter(({ side }) => numberOrZero(side.effectiveFloor) <= 0).length,
    missing_effective_floor_actionable: activeSideRows.filter(({ side }) => numberOrZero(side.effectiveFloor) <= 0 && !repricerDeferredPricingSide(side)).length,
    missing_status: activeSideRows.filter(({ side }) => !String(side.status || '').trim()).length,
    fallback_rows: activeSideRows.filter(({ side }) => side.economicFloorSource === 'snapshot_fallback').length,
    launch_hold_rows: activeSideRows.filter(({ side }) => side.launchHold === 'LAUNCH_HOLD').length,
    alignment_changed_rows: rows.filter((row) => row.alignmentChanged).length,
    smoke_passed: smokeTests.filter((item) => item.pass).length,
    smoke_total: smokeTests.length,
    promo_rows: activeSideRows.filter(({ side }) => side.promoActive).length,
    confidence_green: activeSideRows.filter(({ side }) => side.confidence === 'green').length,
    confidence_yellow: activeSideRows.filter(({ side }) => side.confidence === 'yellow').length,
    confidence_red: activeSideRows.filter(({ side }) => side.confidence === 'red').length,
    safe_export_rows: activeSideRows.filter(({ side }) => side.safeToExport || side.promoSafeToExport).length,
    safe_wb_rows: repricerCollectSides(rows, 'wb').filter(({ side }) => side.safeToExport || side.promoSafeToExport).length,
    safe_ozon_rows: repricerCollectSides(rows, 'ozon').filter(({ side }) => side.safeToExport || side.promoSafeToExport).length,
    safe_regular_wb_rows: repricerCollectSides(rows, 'wb').filter(({ side }) => side.safeToExport).length,
    safe_regular_ozon_rows: repricerCollectSides(rows, 'ozon').filter(({ side }) => side.safeToExport).length,
    safe_promo_wb_rows: repricerCollectSides(rows, 'wb').filter(({ side }) => side.promoSafeToExport).length,
    safe_promo_ozon_rows: repricerCollectSides(rows, 'ozon').filter(({ side }) => side.promoSafeToExport).length,
    wb_change_rows: repricerCollectSides(rows, 'wb').filter(({ side }) => repricerTemplateAction(side) === 'CHANGE').length,
    ozon_change_rows: repricerCollectSides(rows, 'ozon').filter(({ side }) => repricerTemplateAction(side) === 'CHANGE').length
  };
  const issues = [];
  if (metrics.missing_required_margin > 0) issues.push(`нет обязательной маржи SKU: ${fmt.int(metrics.missing_required_margin)}`);
  if (metrics.blocked_gate > 0) issues.push(`BLOCK gate: ${fmt.int(metrics.blocked_gate)}`);
  if (metrics.missing_current_price_actionable > 0) issues.push(`пустая текущая цена в активном контуре: ${fmt.int(metrics.missing_current_price_actionable)}`);
  if (metrics.missing_cost_actionable > 0) issues.push(`нет себестоимости без защитного proxy: ${fmt.int(metrics.missing_cost_actionable)}`);
  if (metrics.missing_effective_floor_actionable > 0) issues.push(`нет effective floor в активном контуре: ${fmt.int(metrics.missing_effective_floor_actionable)}`);
  if (metrics.missing_status > 0) issues.push(`не задан статус товара: ${fmt.int(metrics.missing_status)}`);
  if (metrics.smoke_passed < metrics.smoke_total) issues.push(`smoke tests: ${fmt.int(metrics.smoke_passed)}/${fmt.int(metrics.smoke_total)}`);
  return {
    metrics,
    stopReasons,
    smokeTests,
    issues,
    ok: issues.length === 0
  };
}

function repricerTemplateStats(rows, platform = 'wb') {
  const sides = repricerCollectSides(rows, platform).filter(({ side }) => side);
  const active = sides.filter(({ side }) => !side.outOfSpec);
  const nonPromo = active.filter(({ side }) => !side.promoActive);
  const green = active.filter(({ side }) => side.confidence === 'green');
  const regularSafe = nonPromo.filter(({ side }) => side.safeToExport);
  const promoSafe = active.filter(({ side }) => side.promoSafeToExport);
  const safe = regularSafe.length + promoSafe.length;
  return {
    platform: platform === 'ozon' ? 'ozon' : 'wb',
    label: platform === 'ozon' ? 'Ozon' : 'WB',
    total: sides.length,
    active: active.length,
    safe,
    regularSafe: regularSafe.length,
    promoSafe: promoSafe.length,
    green: green.length,
    greenChanged: green.filter(({ side }) => side.changed).length,
    greenNoChange: green.filter(({ side }) => !side.changed).length,
    changed: active.filter(({ side }) => side.changed).length,
    regularChanged: nonPromo.filter(({ side }) => side.changed).length,
    promoChanged: active.filter(({ side }) => side.promoActive && side.changed).length,
    yellow: active.filter(({ side }) => side.confidence === 'yellow').length,
    red: active.filter(({ side }) => side.confidence === 'red').length,
    belowMin: active.filter(({ side }) => repricerBelowMinNeedsManual(side)).length,
    floorRaiseReady: nonPromo.filter(({ side }) => side.floorRaiseReady).length,
    floorRaiseSafe: nonPromo.filter(({ side }) => side.floorRaiseSafeToExport).length,
    blocked: active.filter(({ side }) => side.criticalGate === 'BLOCK').length,
    missingMargin: active.filter(({ side }) => side.marginPolicyMissing).length,
    missingMin: active.filter(({ side }) => numberOrZero(side.effectiveFloor) <= 0 && !repricerDeferredPricingSide(side)).length,
    missingCost: active.filter(({ side }) => numberOrZero(side.costRub) <= 0 && !side.pricingProxyPresent && !repricerDeferredPricingSide(side)).length,
    promo: active.filter(({ side }) => side.promoActive).length,
    outOfSpec: sides.filter(({ side }) => side.outOfSpec).length
  };
}

function repricerTemplateEmptyReason(stats) {
  if (!stats) return 'нет данных для проверки шаблона';
  if (stats.safe > 0) {
    const regularSafe = numberOrZero(stats.regularSafe ?? stats.safe);
    const promoSafe = numberOrZero(stats.promoSafe);
    const parts = [
      regularSafe > 0 ? `обычный файл ${fmt.int(regularSafe)}` : '',
      promoSafe > 0 ? `промо-файл ${fmt.int(promoSafe)}` : ''
    ].filter(Boolean).join(', ');
    return `${stats.label}: в файлы цен попадёт ${parts || fmt.int(stats.safe)} строк.`;
  }
  if (stats.greenNoChange > 0 && stats.changed <= 0) return `${stats.label}: зелёные есть, но цена не меняется, поэтому файл цен пуст.`;
  if (stats.yellow || stats.red) return `${stats.label}: строки есть в аудите: инфо ${fmt.int(stats.yellow)}, стоп ${fmt.int(stats.red)}.`;
  if (stats.missingMin || stats.missingCost || stats.blocked) return `${stats.label}: мешают данные контура: нет MIN ${fmt.int(stats.missingMin)}, нет себестоимости ${fmt.int(stats.missingCost)}, нет входов ${fmt.int(stats.blocked)}.`;
  if (stats.promo > 0) return `${stats.label}: часть строк в промо, они уходят в отдельную промо-выгрузку.`;
  return `${stats.label}: нет зелёных строк с изменением цены.`;
}

function repricerTopStatusText(stats) {
  const totalSafe = numberOrZero(stats?.wb?.safe) + numberOrZero(stats?.ozon?.safe);
  if (totalSafe > 0) return `Сегодня можно выгружать: WB ${fmt.int(stats.wb.safe)}, Ozon ${fmt.int(stats.ozon.safe)}.`;
  const blockers = [
    ['нет MIN', numberOrZero(stats?.wb?.missingMin) + numberOrZero(stats?.ozon?.missingMin)],
    ['нет себестоимости', numberOrZero(stats?.wb?.missingCost) + numberOrZero(stats?.ozon?.missingCost)],
    ['нет входов', numberOrZero(stats?.wb?.blocked) + numberOrZero(stats?.ozon?.blocked)],
    ['ниже MIN вручную', numberOrZero(stats?.wb?.belowMin) + numberOrZero(stats?.ozon?.belowMin)],
    ['аудит', numberOrZero(stats?.wb?.yellow) + numberOrZero(stats?.ozon?.yellow)]
  ].filter(([, count]) => count > 0).slice(0, 3);
  if (blockers.length) {
    return `Сегодня не выгружаем автоматически: ${blockers.map(([label, count]) => `${label} ${fmt.int(count)}`).join(', ')}.`;
  }
  return 'Сегодня шаблон пуст: нет зелёных строк с изменением цены.';
}

function repricerGameToneClass(tone) {
  return ['ok', 'warn', 'danger'].includes(String(tone || '')) ? String(tone) : 'warn';
}

function repricerGamePct(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return fmt.pct(value);
}

function repricerGamePlatformModel(stats = {}, options = {}) {
  const active = numberOrZero(stats.active || stats.total);
  const regularSafe = numberOrZero(options.regularSafeRows ?? stats.regularSafe ?? stats.safe);
  const promoSafe = numberOrZero(options.promoSafeRows ?? stats.promoSafe);
  const safe = numberOrZero(options.safeRows ?? (regularSafe + promoSafe));
  const green = numberOrZero(stats.green);
  const yellow = numberOrZero(stats.yellow);
  const red = numberOrZero(stats.red);
  const check = numberOrZero(options.checkCount ?? (yellow + red));
  const hardStops = red + numberOrZero(stats.missingMin) + numberOrZero(stats.blocked);
  const softStops = yellow + numberOrZero(stats.missingCost) + numberOrZero(stats.belowMin);
  const completion = active > 0 ? (green + yellow) / active : null;
  const tone = safe > 0 || hardStops <= 0 ? 'ok' : 'danger';
  const status = safe > 0 ? 'ОК к выгрузке' : (tone === 'danger' ? 'СТОП' : (softStops > 0 ? 'ОК, есть аудит' : 'ОК без изменений'));
  return {
    platform: stats.platform || options.platform || 'wb',
    label: stats.label || (options.platform === 'ozon' ? 'Ozon' : 'WB'),
    active,
    safe,
    regularSafe,
    promoSafe,
    green,
    yellow,
    red,
    check,
    hardStops,
    softStops,
    completion,
    tone,
    status,
    progress: completion == null ? 0 : Math.max(0, Math.min(100, completion * 100))
  };
}

function repricerGameReadinessModel(health = {}, templateStats = {}, context = {}) {
  const wb = repricerGamePlatformModel(templateStats.wb || {}, {
    platform: 'wb',
    safeRows: context.safeWbRows,
    regularSafeRows: context.safeWbRegularRows,
    promoSafeRows: context.safePromoWbRows,
    checkCount: context.wbCheckCount
  });
  const ozon = repricerGamePlatformModel(templateStats.ozon || {}, {
    platform: 'ozon',
    safeRows: context.safeOzonRows,
    regularSafeRows: context.safeOzonRegularRows,
    promoSafeRows: context.safePromoOzonRows,
    checkCount: context.ozonCheckCount
  });
  const metrics = health.metrics || {};
  const active = wb.active + ozon.active;
  const safe = wb.safe + ozon.safe;
  const green = wb.green + ozon.green;
  const yellow = wb.yellow + ozon.yellow;
  const red = wb.red + ozon.red;
  const hardStops = red
    + numberOrZero(metrics.blocked_gate)
    + numberOrZero(metrics.missing_effective_floor_actionable);
  const softStops = yellow
    + numberOrZero(context.belowMinSides)
    + numberOrZero(metrics.missing_cost_actionable)
    + numberOrZero(context.liveDriftSides);
  const completion = active > 0 ? (green + yellow) / active : null;
  const tone = safe > 0 || hardStops <= 0 ? 'ok' : 'danger';
  const title = safe > 0
    ? 'В работе'
    : (tone === 'danger' ? 'СТОП' : 'Контур чистый');
  const subtitle = safe > 0
    ? 'Зелёные строки можно выгружать сейчас. Инфо-аудит не блокирует запуск, красные остаются стопом.'
    : tone === 'danger'
      ? 'Нет безопасных строк: сначала закрыть красные причины.'
      : 'Критичных стопов нет, но новых цен для шаблона сейчас нет.';
  return {
    tone,
    title,
    subtitle,
    active,
    safe,
    green,
    yellow,
    red,
    completion,
    progress: completion == null ? 0 : Math.max(0, Math.min(100, completion * 100)),
    wb,
    ozon,
    hardStops,
    softStops,
    smokePassed: numberOrZero(metrics.smoke_passed),
    smokeTotal: numberOrZero(metrics.smoke_total)
  };
}

function repricerGameMetricHtml(label, value, detail = '', tone = 'info', tip = '') {
  const safeTone = ['ok', 'warn', 'danger', 'info'].includes(String(tone || '')) ? String(tone) : 'info';
  return `
    <div class="repricer-game-metric ${escapeHtml(safeTone)}" ${tip ? `data-tip="${escapeHtml(tip)}"` : ''}>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value ?? '—'))}</strong>
      <em>${escapeHtml(detail || '')}</em>
    </div>
  `;
}

function repricerGameHeroHtml(model = {}) {
  const tone = repricerGameToneClass(model.tone);
  const completionText = repricerGamePct(model.completion);
  return `
    <div class="repricer-game-hero ${escapeHtml(tone)}" style="--repricer-ready:${numberOrZero(model.progress).toFixed(1)}%">
      <div class="repricer-game-main">
        <div class="repricer-game-score" data-tip="${escapeHtml(`Готовность = рабочие строки без красных стопов / активные строки WB+Ozon. Инфо-строки остаются в аудите, но не режут процент.`)}">
          <span>готовность репрайсера</span>
          <strong>${escapeHtml(completionText)}</strong>
          <em>${escapeHtml(model.title || 'Проверить')}</em>
        </div>
        <div class="repricer-game-track" title="${escapeHtml(`${fmt.int(model.green + model.yellow)} рабочих из ${fmt.int(model.active)} активных строк`)}">
          <i></i>
          <span class="mark-50">50%</span>
          <span class="mark-80">80%</span>
          <span class="mark-100">100%</span>
        </div>
        <div class="repricer-game-verdict" data-tip="${escapeHtml(model.subtitle || '')}">
          <span>решение сейчас</span>
          <strong>${escapeHtml(model.title || 'Проверить')}</strong>
          <em>${escapeHtml(model.subtitle || '')}</em>
        </div>
      </div>
      <div class="repricer-game-metrics">
        ${repricerGameMetricHtml('В файл цен', fmt.int(model.safe), `WB ${fmt.int(model.wb?.safe)} · Ozon ${fmt.int(model.ozon?.safe)}`, model.safe > 0 ? 'ok' : 'warn', 'Количество строк без красного стопа, где цена изменилась и попадет в обычный или промо-файл WB/Ozon.')}
        ${repricerGameMetricHtml('Зелёные', fmt.int(model.green), `${fmt.int(model.active)} активных строк`, 'ok', 'Зелёные строки прошли проверки. Если цена не изменилась, они остаются зелёными, но в ценовой шаблон не попадают.')}
        ${repricerGameMetricHtml('Аудит', fmt.int(model.yellow), 'инфо-строки', model.yellow > 0 ? 'info' : 'ok', 'Строки с мягкими причинами остаются в аудите, но не режут процент готовности контура.')}
        ${repricerGameMetricHtml('Стоп', fmt.int(model.red), 'красные строки', model.red > 0 ? 'danger' : 'ok', 'Красные строки блокируют автоматическую выгрузку до исправления входов или решения.')}
      </div>
    </div>
  `;
}

function repricerGameMarketplaceCardHtml(platformModel = {}, stats = {}) {
  const platform = platformModel.platform === 'ozon' ? 'ozon' : 'wb';
  const buttonLabel = platform === 'ozon' ? 'Скачать шаблон Ozon' : 'Скачать шаблон WB';
  const promoButtonLabel = platform === 'ozon' ? 'Скачать промо Ozon' : 'Скачать промо WB';
  const exportMode = platform === 'ozon' ? 'template:ozon' : 'template:wb';
  const promoExportMode = platform === 'ozon' ? 'promo:ozon' : 'promo:wb';
  const tone = repricerGameToneClass(platformModel.tone);
  const regularSafe = numberOrZero(platformModel.regularSafe);
  const promoSafe = numberOrZero(platformModel.promoSafe);
  const tip = `${platformModel.label}: зелёные ${fmt.int(platformModel.green)}, аудит ${fmt.int(platformModel.yellow)}, стоп ${fmt.int(platformModel.red)}, в файлы ${fmt.int(platformModel.safe)}; обычный ${fmt.int(regularSafe)}, промо ${fmt.int(promoSafe)}.`;
  return `
    <div class="repricer-marketplace-card repricer-game-platform-card ${escapeHtml(platform)} ${escapeHtml(tone)}" style="--repricer-platform-ready:${numberOrZero(platformModel.progress).toFixed(1)}%" data-tip="${escapeHtml(tip)}">
      <div class="repricer-marketplace-title">
        <span>${escapeHtml(platformModel.label)}</span>
        ${badge(platformModel.status, tone === 'danger' ? 'danger' : tone === 'warn' ? 'warn' : 'ok')}
      </div>
      <div class="repricer-marketplace-count">${fmt.int(platformModel.safe)}</div>
      <div class="repricer-game-platform-bar"><i></i></div>
      <p>${escapeHtml(repricerTemplateEmptyReason(stats))}</p>
      <div class="repricer-mini-metrics">
        <span>готовность ${escapeHtml(repricerGamePct(platformModel.completion))}</span>
        <span>обычные ${fmt.int(regularSafe)}</span>
        <span>промо ${fmt.int(promoSafe)}</span>
        <span>зелёные ${fmt.int(platformModel.green)}</span>
        <span>проверить ${fmt.int(platformModel.check)}</span>
        <span>стоп ${fmt.int(platformModel.red)}</span>
      </div>
      <button type="button" class="repricer-marketplace-button ${escapeHtml(platform)}" data-repricer-export="${escapeHtml(exportMode)}" data-repricer-empty="${regularSafe ? '0' : '1'}">${escapeHtml(buttonLabel)}</button>
      ${promoSafe ? `<button type="button" class="repricer-marketplace-button ${escapeHtml(platform)}" data-repricer-export="${escapeHtml(promoExportMode)}" data-repricer-empty="0">${escapeHtml(promoButtonLabel)}</button>` : ''}
    </div>
  `;
}

function repricerDownloadHtmlTable(columns, rows, filename, options = {}) {
  if (!rows.length && !options.allowEmpty) return { ok: false, rows: 0, filename };
  const head = `<tr>${columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr>`;
  const body = rows.map((row) => `<tr>${columns.map(([key]) => `<td>${escapeHtml(row[key] ?? '')}</td>`).join('')}</tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1">${head}${body}</table></body></html>`;
  const blob = new Blob(['\uFEFF', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true, rows: rows.length, filename };
}

function repricerIssueScore(side) {
  const flags = repricerIssueFlags(side);
  return (flags.missingMargin ? 150 : 0)
    + (flags.missingMin ? 120 : 0)
    + (flags.belowMin ? 95 : 0)
    + (flags.blocked ? 75 : 0)
    + (flags.marginRisk ? 55 : 0)
    + (flags.missingPrice ? 45 : 0)
    + (flags.missingCost ? 35 : 0)
    + (flags.liveDrift ? 20 : 0)
    + (side?.confidence === 'red' ? 15 : 0)
    + numberOrZero(side?.confidenceScore);
}

function repricerIssueRows(batch = 'all', sourceRows = null) {
  const normalizedBatch = String(batch || 'all');
  const rows = Array.isArray(sourceRows) ? sourceRows : buildRepricerRows();
  return repricerCollectSides(rows)
    .filter(({ side }) => side)
    .filter(({ side }) => side.confidence !== 'green' || repricerBelowMinNeedsManual(side) || side.liveDrift || side.marginRisk)
    .map(({ row, platformLabel, side }) => {
      const issueBatch = repricerIssueBatch(side);
      const reason = repricerPrimaryStopReason(side) || issueBatch;
      return {
        generated_at: state.smartPriceWorkbench?.generatedAt || '',
        batch: repricerIssueBatchLabel(issueBatch),
        priority: repricerIssueScore(side),
        marketplace: platformLabel,
        article_key: row.articleKey,
        article: row.article || row.articleKey,
        name: row.name || '',
        owner: row.owner || '',
        brand: row.brand || '',
        status: row.status || '',
        confidence: repricerConfidenceLabel(side.confidence),
        confidence_score: repricerExportNumber(side.confidenceScore),
        reason,
        where_fix: repricerFixSource(side),
        what_to_fill: repricerFixAction(side),
        proposal_no_write: repricerFixProposal(side),
        current_price_rub: repricerExportNumber(side.currentPrice),
        final_price_rub: repricerExportNumber(side.finalPrice),
        min_rub: repricerExportNumber(side.effectiveFloor),
        cost_rub: repricerExportNumber(side.costRub),
        live_rec_price_rub: repricerExportNumber(side.liveReferencePrice),
        decision_text: side.decisionText || '',
        confidence_reasons: Array.isArray(side.confidenceReasons) ? side.confidenceReasons.join(' · ') : '',
        safe_export: side.safeToExport || side.promoSafeToExport ? 'yes' : 'no',
        reason_code: side.finalReasonCode || side.reasonCode || '',
        import_command: '',
        import_price_rub: '',
        import_min_rub: '',
        import_max_rub: '',
        import_cost_rub: '',
        import_status: '',
        import_role: '',
        import_launch_ready: '',
        import_note: '',
        command_hint: repricerCommandHint(side),
        recommended_action: repricerRecommendedAction(side),
        fix_team: repricerFixTeamLabel(repricerFixTeamKey(side)),
        price_trace: repricerPriceTrace(row, side)
      };
    })
    .filter((row) => normalizedBatch === 'all' || row.batch === repricerIssueBatchLabel(normalizedBatch))
    .sort((left, right) => numberOrZero(right.priority) - numberOrZero(left.priority)
      || String(left.article || '').localeCompare(String(right.article || ''), 'ru'));
}

function repricerIssueColumns() {
  return [
    ['import_command', 'Команда'],
    ['import_price_rub', 'Новая цена, ₽'],
    ['import_min_rub', 'Новый MIN, ₽'],
    ['import_max_rub', 'Новый MAX, ₽'],
    ['import_cost_rub', 'Новая себестоимость, ₽'],
    ['import_status', 'Новый статус'],
    ['import_role', 'Новая роль'],
    ['import_launch_ready', 'Новый launch ready'],
    ['import_note', 'Комментарий для импорта'],
    ['command_hint', 'Что написать в Команда'],
    ['recommended_action', 'Рекомендованное действие'],
    ['fix_team', 'Кто чинит'],
    ['price_trace', 'Почему цена такая'],
    ['generated_at', 'Срез'],
    ['batch', 'Пачка'],
    ['priority', 'Приоритет'],
    ['marketplace', 'Площадка'],
    ['article_key', 'article_key'],
    ['article', 'Артикул'],
    ['name', 'Название'],
    ['owner', 'Owner'],
    ['brand', 'Бренд'],
    ['status', 'Статус'],
    ['confidence', 'Confidence'],
    ['confidence_score', 'Confidence score'],
    ['reason', 'Причина'],
    ['where_fix', 'Где чинить'],
    ['what_to_fill', 'Что сделать'],
    ['proposal_no_write', 'Предложение без записи'],
    ['current_price_rub', 'Текущая цена, ₽'],
    ['final_price_rub', 'Финальная цена, ₽'],
    ['min_rub', 'MIN, ₽'],
    ['cost_rub', 'Себестоимость, ₽'],
    ['live_rec_price_rub', 'Live rec, ₽'],
    ['decision_text', 'Решение'],
    ['confidence_reasons', 'Проверки'],
    ['safe_export', 'В безопасной выгрузке'],
    ['reason_code', 'Reason code']
  ];
}

function downloadRepricerStopList(batch = 'all', sourceRows = null) {
  const rows = repricerIssueRows(batch, sourceRows);
  if (!rows.length) {
    return { ok: false, rows: 0, tone: 'ok', message: 'В этой пачке нет проблемных строк.' };
  }
  const suffix = batch === 'all' ? 'stop-list' : `batch-${batch}`;
  repricerDownloadHtmlTable(repricerIssueColumns(), rows, `repricer-${suffix}-${new Date().toISOString().slice(0, 10)}.xls`);
  return { ok: true, rows: rows.length, tone: 'ok', message: `Стоп-лист подготовлен: ${fmt.int(rows.length)} строк.` };
}

function downloadRepricerFixProposals(sourceRows = null) {
  const rows = repricerIssueRows('all', sourceRows).filter((row) => row.proposal_no_write);
  if (!rows.length) {
    return { ok: false, rows: 0, tone: 'ok', message: 'Сейчас нет предложений для исправления.' };
  }
  repricerDownloadHtmlTable(repricerIssueColumns(), rows, `repricer-fix-proposals-${new Date().toISOString().slice(0, 10)}.xls`);
  return { ok: true, rows: rows.length, tone: 'ok', message: `Предложения подготовлены: ${fmt.int(rows.length)} строк.` };
}

function downloadRepricerTeamIssues(team = 'all', sourceRows = null) {
  const normalizedTeam = String(team || 'all');
  const rows = repricerIssueRows('all', sourceRows).filter((row) => normalizedTeam === 'all' || String(row.fix_team || '') === repricerFixTeamLabel(normalizedTeam));
  if (!rows.length) {
    return { ok: false, rows: 0, tone: 'ok', message: 'Для этой команды сейчас нет строк в аудите.' };
  }
  repricerDownloadHtmlTable(repricerIssueColumns(), rows, `repricer-team-${normalizedTeam}-${new Date().toISOString().slice(0, 10)}.xls`);
  return { ok: true, rows: rows.length, tone: 'ok', message: `Файл команды подготовлен: ${fmt.int(rows.length)} строк.` };
}

function repricerImportKey(value) {
  return String(value || '').trim().toLowerCase().replaceAll('ё', 'е').replace(/[^a-zа-я0-9]+/gi, '');
}

function repricerImportValue(row, aliases) {
  const normalized = row.__normalized || {};
  for (const alias of aliases) {
    const value = normalized[repricerImportKey(alias)];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function repricerImportNumber(value) {
  const raw = String(value || '').replace(/\s+/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : '';
}

function repricerImportPercent(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const raw = text.replace(/\s+/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  const ratio = text.includes('%') || parsed > 1 ? parsed / 100 : parsed;
  return ratio > 0 && ratio < 1 ? ratio : '';
}

function repricerImportPlatform(value) {
  const raw = String(value || '').trim().toLowerCase();
  const compact = raw.replace(/[\s_.-]+/g, '');
  if (raw.includes('ozon') || raw.includes('озон')) return 'ozon';
  if (raw.includes('wb') || raw.includes('wild') || raw.includes('вайлд')) return 'wb';
  if (['ym', 'ya', 'yandex', 'yandexmarket', 'yamarket'].includes(compact)) return 'ym';
  if (['ga', 'goldapple', 'goldenapple'].includes(compact)) return 'goldapple';
  if (['letu', 'letual', 'letoile'].includes(compact)) return 'letu';
  if (['megamarket', 'sbermegamarket'].includes(compact)) return 'megamarket';
  if (['samokat'].includes(compact)) return 'samokat';
  if (['mm', 'magnit', 'magnitmarket'].includes(compact)) return 'magnit';
  return 'all';
}

function repricerImportCommand(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (/(ignore|skip|keep|no|нет|игнор|пропуст|остав)/i.test(raw)) return 'ignore';
  if (/(clear|reset|сброс|очист)/i.test(raw)) return 'clear';
  if (/(add|добав)/i.test(raw)) return 'add';
  if (/(delete|remove|off|del|удал|исключ|выключ|вывод)/i.test(raw)) return 'off';
  if (/(hold|freeze|stop|стоп|холд|пауза|замороз)/i.test(raw)) return 'hold';
  if (/(force|фикс|цена)/i.test(raw)) return 'force';
  if (/(fix|apply|ok|yes|да|исправ|примен)/i.test(raw)) return 'fix';
  return '';
}

function repricerParseDelimitedText(text) {
  const sample = String(text || '').slice(0, 2000);
  const counts = {
    tab: (sample.match(/\t/g) || []).length,
    semicolon: (sample.match(/;/g) || []).length,
    comma: (sample.match(/,/g) || []).length
  };
  const delimiter = counts.tab >= counts.semicolon && counts.tab >= counts.comma ? '\t' : counts.semicolon >= counts.comma ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }
    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((item) => String(item || '').trim())) rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((item) => String(item || '').trim())) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => String(header || '').trim());
  return rows.slice(1).map((values) => {
    const item = {};
    const normalized = {};
    headers.forEach((header, index) => {
      item[header] = String(values[index] || '').trim();
      normalized[repricerImportKey(header)] = item[header];
    });
    item.__normalized = normalized;
    return item;
  });
}

function repricerParseAuditImportText(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  if (source.includes('<table') || source.includes('<TABLE')) {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const table = doc.querySelector('table');
    if (table) {
      const matrix = Array.from(table.querySelectorAll('tr')).map((tr) => Array.from(tr.children).map((cell) => String(cell.textContent || '').trim()));
      const filledRows = matrix.filter((row) => row.some((cell) => String(cell || '').trim()));
      if (filledRows.length > 1) {
        const headers = filledRows[0];
        return filledRows.slice(1).map((values) => {
          const item = {};
          const normalized = {};
          headers.forEach((header, index) => {
            item[header] = String(values[index] || '').trim();
            normalized[repricerImportKey(header)] = item[header];
          });
          item.__normalized = normalized;
          return item;
        });
      }
    }
  }
  return repricerParseDelimitedText(source);
}

function repricerReadFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Не удалось прочитать файл.'));
    reader.readAsText(file, 'utf-8');
  });
}

function repricerReadFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Не удалось прочитать Excel-файл.'));
    reader.readAsArrayBuffer(file);
  });
}

function repricerRowsFromMatrix(matrix = []) {
  const filledRows = (Array.isArray(matrix) ? matrix : [])
    .map((row) => (Array.isArray(row) ? row : []).map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some((cell) => cell));
  if (filledRows.length < 2) return [];
  const headerIndex = filledRows.findIndex((row) => {
    const keys = row.map(repricerImportKey);
    const hasArticle = keys.some((key) => ['articlekey', 'article_key', 'артикул', 'skucode', 'sku'].includes(key));
    const hasInput = keys.some((key) => (
      key.includes('маржа')
      || key.includes('margin')
      || key.includes('minprice')
      || key.includes('maxprice')
      || key.includes('команда')
    ));
    return hasArticle && hasInput;
  });
  const resolvedHeaderIndex = headerIndex >= 0 ? headerIndex : 0;
  const headers = filledRows[resolvedHeaderIndex].map((header) => String(header || '').trim());
  return filledRows.slice(resolvedHeaderIndex + 1).map((values) => {
    const item = {};
    const normalized = {};
    headers.forEach((header, index) => {
      item[header] = String(values[index] ?? '').trim();
      normalized[repricerImportKey(header)] = item[header];
    });
    item.__normalized = normalized;
    return item;
  });
}

function repricerParseXlsxArrayBuffer(arrayBuffer) {
  if (!window.XLSX?.read || !window.XLSX?.utils?.sheet_to_json) {
    throw new Error('Модуль чтения XLSX не загрузился. Обновите страницу и повторите импорт.');
  }
  const workbook = window.XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: true,
    cellFormula: true,
    cellNF: true
  });
  const preferredNames = ['Импорт в портал', 'Маржа SKU', 'Аудит', 'Согласование РОП'];
  const sheetNames = [
    ...preferredNames.filter((name) => workbook.SheetNames.includes(name)),
    ...workbook.SheetNames.filter((name) => !preferredNames.includes(name))
  ];
  let best = { rows: [], sheetName: '', score: -1 };
  sheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;
    const matrix = window.XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false
    });
    const rows = repricerRowsFromMatrix(matrix);
    const actionable = rows.filter((row) => {
      const draft = repricerImportDraft(row, sheetName);
      return Boolean(draft.articleKey && draft.hasImportFields);
    }).length;
    const statusCounts = rows.reduce((acc, row) => {
      const status = repricerImportValue(row, ['Контроль', 'Решение РОП']);
      const normalized = String(status || '').trim().toUpperCase();
      if (/ОЖИДАЕТ РОП|НА СОГЛАСОВАНИИ/.test(normalized)) acc.awaitingRop += 1;
      if (/СТОП|ОТКЛОН/.test(normalized)) acc.blocked += 1;
      if (/ГОТОВО К ИМПОРТУ|СОГЛАСОВАНО|УТВЕРЖДЕНО/.test(normalized)) acc.approved += 1;
      return acc;
    }, { awaitingRop: 0, blocked: 0, approved: 0 });
    const preferredBonus = preferredNames.includes(sheetName) ? 1000 - preferredNames.indexOf(sheetName) * 100 : 0;
    const score = preferredBonus + actionable * 10 + rows.length;
    if (score > best.score) best = { rows, sheetName, score, ...statusCounts };
  });
  if (best.rows.length) {
    best.rows.__workbookMeta = {
      sheetName: best.sheetName,
      awaitingRop: best.awaitingRop || 0,
      blocked: best.blocked || 0,
      approved: best.approved || 0
    };
  }
  return best.rows;
}

function repricerExactStorageItem(bucket, articleKey, platform = 'all') {
  return (state.storage?.[bucket] || []).find((item) => String(item.articleKey || '').trim() === articleKey
    && String(item.platform || 'all').trim().toLowerCase() === platform) || null;
}

const REPRICER_API_QUEUE_BUCKETS = new Set(['repricerPendingApiAdds', 'repricerPendingApiDeletes', 'repricerPendingCostFixes', 'repricerPendingApiTasks']);

function repricerQueueTaskField(item = {}, bucket = '', type = '') {
  const normalizedType = String(type || item.type || item.action || repricerTaskTypeFromBucket(bucket, item)).trim().toUpperCase();
  const rawField = String(item.field || item.apiField || '').trim().toLowerCase();
  if (normalizedType === 'UPDATE_COST' || bucket === 'repricerPendingCostFixes') return 'cost';
  if (normalizedType === 'ADD_SKU' || normalizedType === 'DELETE_SKU' || bucket === 'repricerPendingApiAdds' || bucket === 'repricerPendingApiDeletes') return 'sku';
  if (rawField) return rawField;
  return String(item.reason || '').trim().toLowerCase();
}

function repricerQueueTaskSemanticKey(item = {}, bucket = '') {
  const type = String(item.type || item.action || repricerTaskTypeFromBucket(bucket, item) || 'API_TASK').trim().toUpperCase();
  const articleKey = String(item.articleKey || item.article || item.sku || '').trim();
  const platform = repricerQueuePlatform(item.platform);
  const field = repricerQueueTaskField(item, bucket, type);
  if (articleKey) return `${type}|${articleKey}|${platform}|${field}`;
  return String(item.id || '').trim();
}

function repricerQueuePayloadSignature(item = {}, bucket = '') {
  const type = String(item.type || item.action || repricerTaskTypeFromBucket(bucket, item)).trim().toUpperCase();
  const field = repricerQueueTaskField(item, bucket, type);
  const value = item.value ?? item.costRub ?? '';
  return `${type}|${field}|${String(value).trim()}`;
}

function repricerQueueStatusRank(item = {}) {
  const status = repricerTaskStatus(item);
  if (status === 'accepted') return 4;
  if (status === 'sent') return 3;
  if (status === 'open') return 2;
  if (status === 'error') return 1;
  return 0;
}

function repricerQueueStamp(item = {}) {
  const stamp = Date.parse(String(item.updatedAt || item.acceptedAt || item.reconciledAt || item.sentAt || item.requestedAt || item.createdAt || ''));
  return Number.isFinite(stamp) ? stamp : 0;
}

function repricerChooseQueueItem(bucket, left, right) {
  if (!left) return right;
  if (!right) return left;
  const leftSignature = repricerQueuePayloadSignature(left, bucket);
  const rightSignature = repricerQueuePayloadSignature(right, bucket);
  if (leftSignature !== rightSignature) {
    return repricerQueueStamp(right) >= repricerQueueStamp(left) ? right : left;
  }
  const leftRank = repricerQueueStatusRank(left);
  const rightRank = repricerQueueStatusRank(right);
  if (rightRank !== leftRank) return rightRank > leftRank ? right : left;
  return repricerQueueStamp(right) >= repricerQueueStamp(left) ? right : left;
}

function repricerNormalizeQueueTask(bucket, item = {}) {
  const type = String(item.type || item.action || repricerTaskTypeFromBucket(bucket, item) || 'API_TASK').trim().toUpperCase();
  const field = repricerQueueTaskField(item, bucket, type);
  return {
    ...item,
    type,
    action: item.action || item.type || type,
    platform: repricerQueuePlatform(item.platform),
    field,
    value: item.value ?? item.costRub ?? ''
  };
}

function repricerDedupeQueueItems(bucket, items = []) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const normalized = repricerNormalizeQueueTask(bucket, item || {});
    const key = repricerQueueTaskSemanticKey(normalized, bucket);
    if (!key) return;
    map.set(key, repricerChooseQueueItem(bucket, map.get(key), normalized));
  });
  return [...map.values()].sort((left, right) => repricerQueueStamp(right) - repricerQueueStamp(left));
}

function repricerMergeQueueUpsert(bucket, existing, incoming) {
  if (!existing || !REPRICER_API_QUEUE_BUCKETS.has(bucket)) return incoming;
  const type = incoming.type || incoming.action || existing.type || existing.action || repricerTaskTypeFromBucket(bucket, incoming);
  const next = {
    ...existing,
    ...incoming,
    id: incoming.id || existing.id,
    type,
    action: incoming.action || incoming.type || existing.action || existing.type || type,
    requestedAt: existing.requestedAt || incoming.requestedAt || incoming.updatedAt || '',
    updatedAt: incoming.updatedAt || incoming.requestedAt || new Date().toISOString()
  };
  const changed = repricerQueuePayloadSignature(existing, bucket) !== repricerQueuePayloadSignature(next, bucket);
  if (changed) {
    next.status = incoming.status || 'open';
    delete next.sentAt;
    delete next.sentBy;
    delete next.acceptedAt;
    delete next.reconciledAt;
    delete next.resultMessage;
    return next;
  }
  const existingStatus = repricerTaskStatus(existing);
  if (existingStatus !== 'open') {
    next.status = existingStatus === 'error' && existing.sentAt ? 'sent' : existingStatus;
    next.sentAt = existing.sentAt || incoming.sentAt || '';
    next.sentBy = existing.sentBy || incoming.sentBy || '';
    next.acceptedAt = existing.acceptedAt || incoming.acceptedAt || '';
    next.reconciledAt = existing.reconciledAt || incoming.reconciledAt || '';
    next.resultMessage = existing.resultMessage || incoming.resultMessage || '';
  }
  return next;
}

function repricerUpsertStorageItem(bucket, item, predicate) {
  const current = state.storage[bucket] || [];
  const existing = current.find((entry) => predicate(entry)) || null;
  const next = repricerMergeQueueUpsert(bucket, existing, item);
  state.storage[bucket] = current.filter((entry) => !predicate(entry));
  state.storage[bucket].unshift(next);
  if (REPRICER_API_QUEUE_BUCKETS.has(bucket)) state.storage[bucket] = repricerDedupeQueueItems(bucket, state.storage[bucket]);
}

function repricerTeamActor() {
  return state.team?.member?.name || 'Команда';
}

function repricerQueuePlatform(platform = 'all') {
  const raw = String(platform || '').trim().toLowerCase();
  const compact = raw.replace(/[\s_.-]+/g, '');
  const normalized = repricerImportPlatform(compact);
  if (normalized !== 'all') return normalized;
  return ['wb', 'ozon', 'ym', 'goldapple', 'letu', 'megamarket', 'samokat', 'magnit', 'all'].includes(compact) ? compact : 'all';
}

function repricerQueueTaskKey(item = {}) {
  return repricerQueueTaskSemanticKey(item, 'repricerPendingApiTasks');
}

function repricerQueueApiTask(task = {}) {
  const articleKey = String(task.articleKey || task.article || task.sku || '').trim();
  if (!articleKey) return null;
  const now = task.requestedAt || task.updatedAt || new Date().toISOString();
  const next = {
    id: task.id || stableId('repricer-api', repricerQueueTaskKey(task)),
    type: String(task.type || task.action || 'API_TASK').trim().toUpperCase(),
    action: String(task.action || task.type || 'API_TASK').trim().toUpperCase(),
    articleKey,
    article: String(task.article || articleKey).trim(),
    platform: repricerQueuePlatform(task.platform),
    name: String(task.name || '').trim(),
    owner: String(task.owner || '').trim(),
    field: String(task.field || task.apiField || '').trim(),
    value: task.value ?? task.costRub ?? '',
    status: String(task.status || 'open').trim(),
    requestedAt: now,
    updatedAt: now,
    requestedBy: String(task.requestedBy || repricerTeamActor()).trim() || 'Команда',
    note: String(task.note || '').trim()
  };
  repricerUpsertStorageItem('repricerPendingApiTasks', next, (item) => repricerQueueTaskKey(item) === repricerQueueTaskKey(next));
  return next;
}

function repricerQueueMinMaxTask(task = {}) {
  const articleKey = String(task.articleKey || task.article || '').trim();
  const platform = repricerQueuePlatform(task.platform);
  const min = numberOrZero(task.min ?? task.minPrice ?? task.floorPrice ?? task.hardFloor);
  const max = numberOrZero(task.max ?? task.maxPrice ?? task.capPrice ?? task.stretchCap);
  if (!articleKey || (min <= 0 && max <= 0)) return null;
  const value = [
    min > 0 ? `MIN ${min}` : '',
    max > 0 ? `MAX ${max}` : ''
  ].filter(Boolean).join(' ');
  return repricerQueueApiTask({
    ...task,
    type: 'UPDATE_MIN_MAX',
    action: 'UPDATE_MIN_MAX',
    articleKey,
    platform,
    field: 'min_max',
    value,
    note: task.note || 'Обновить рабочий MIN/MAX в источнике цен'
  });
}

function repricerRecordRepairHistory(item = {}) {
  const articleKey = String(item.articleKey || item.article || '').trim();
  if (!articleKey) return null;
  const now = item.createdAt || new Date().toISOString();
  const next = {
    id: item.id || stableId('repricer-repair', `${now}|${articleKey}|${item.platform || 'all'}|${item.command || item.source || ''}|${item.details || ''}`),
    articleKey,
    article: String(item.article || articleKey).trim(),
    platform: repricerQueuePlatform(item.platform),
    source: String(item.source || 'manual').trim(),
    command: String(item.command || '').trim(),
    result: String(item.result || '').trim(),
    before: String(item.before || '').trim(),
    after: String(item.after || '').trim(),
    details: String(item.details || '').trim(),
    createdAt: now,
    createdBy: String(item.createdBy || repricerTeamActor()).trim() || 'Команда'
  };
  state.storage.repricerRepairHistory = [next, ...(state.storage.repricerRepairHistory || [])]
    .filter((entry, index, list) => list.findIndex((candidate) => candidate.id === entry.id) === index)
    .slice(0, 400);
  return next;
}

function repricerHistoryForSide(side, limit = 5) {
  const articleKey = String(side?.articleKey || '').trim();
  const platform = repricerQueuePlatform(side?.platform);
  if (!articleKey) return [];
  return (state.storage?.repricerRepairHistory || [])
    .filter((item) => String(item.articleKey || '').trim() === articleKey && (repricerQueuePlatform(item.platform) === platform || repricerQueuePlatform(item.platform) === 'all'))
    .slice(0, limit);
}

function repricerApiTaskRows() {
  const rows = [];
  const pushRow = (item = {}, patch = {}) => {
    const articleKey = String(item.articleKey || item.article || item.sku || '').trim();
    if (!articleKey) return;
    rows.push({
      task_type: patch.task_type || patch.type || item.type || item.action || 'API_TASK',
      action: patch.action || item.action || item.type || 'API_TASK',
      marketplace: (patch.marketplace || item.platform || 'all').toString().toUpperCase(),
      article_key: articleKey,
      article: item.article || articleKey,
      name: item.name || '',
      owner: item.owner || '',
      field: patch.field || item.field || '',
      value: patch.value ?? item.value ?? item.costRub ?? '',
      status: patch.status || item.status || 'open',
      status_label: repricerStatusLabel(patch.status || item.status || 'open'),
      requested_at: item.requestedAt || item.updatedAt || '',
      sent_at: item.sentAt || '',
      accepted_at: item.acceptedAt || '',
      reconciled_at: item.reconciledAt || '',
      requested_by: item.requestedBy || item.updatedBy || repricerTeamActor(),
      note: patch.note || item.note || '',
      result: item.resultMessage || ''
    });
  };
  (state.storage?.repricerPendingApiAdds || []).forEach((item) => pushRow(item, { task_type: 'ADD_SKU', action: 'ADD_SKU', field: 'sku', note: item.note || 'Добавить SKU из API-источника' }));
  (state.storage?.repricerPendingApiDeletes || []).forEach((item) => pushRow(item, { task_type: 'DELETE_SKU', action: 'DELETE_SKU', field: 'sku', note: item.note || 'Удалить или выключить лишнюю позицию в API' }));
  (state.storage?.repricerPendingCostFixes || []).forEach((item) => pushRow(item, { task_type: 'UPDATE_COST', action: 'UPDATE_COST', field: 'cost', value: item.costRub ?? item.value ?? '', note: item.note || 'Обновить себестоимость / fee stack в API' }));
  (state.storage?.repricerPendingApiTasks || []).forEach((item) => pushRow(item));
  return rows.sort((left, right) => String(right.requested_at || '').localeCompare(String(left.requested_at || '')));
}

function repricerApiQueueSummary() {
  const rows = repricerApiTaskRows();
  const countType = (type) => rows.filter((row) => String(row.task_type || '').toUpperCase() === type).length;
  const countStatus = (status) => rows.filter((row) => String(row.status || 'open').toLowerCase() === status).length;
  return {
    rows,
    total: rows.length,
    active: rows.filter((row) => String(row.status || 'open').toLowerCase() !== 'accepted').length,
    add: countType('ADD_SKU'),
    remove: countType('DELETE_SKU'),
    cost: countType('UPDATE_COST'),
    minmax: countType('UPDATE_MIN_MAX'),
    priceSnapshot: countType('UPDATE_PRICE_SNAPSHOT'),
    open: countStatus('open'),
    sent: countStatus('sent'),
    accepted: countStatus('accepted'),
    error: countStatus('error')
  };
}

function repricerApiTaskColumns() {
  return [
    ['task_type', 'Тип задачи'],
    ['action', 'Команда API'],
    ['marketplace', 'Площадка'],
    ['article_key', 'article_key'],
    ['article', 'Артикул'],
    ['name', 'Название'],
    ['owner', 'Owner'],
    ['field', 'Поле'],
    ['value', 'Значение'],
    ['status', 'Статус'],
    ['status_label', 'Статус понятный'],
    ['requested_at', 'Создано'],
    ['sent_at', 'Отправлено'],
    ['accepted_at', 'Принято'],
    ['reconciled_at', 'Сверено'],
    ['requested_by', 'Кто создал'],
    ['note', 'Комментарий'],
    ['result', 'Результат сверки']
  ];
}

function downloadRepricerApiTasks() {
  const rows = repricerApiTaskRows();
  if (!rows.length) {
    return { ok: false, rows: 0, tone: 'ok', message: 'Очередь API сейчас пустая.' };
  }
  repricerDownloadHtmlTable(repricerApiTaskColumns(), rows, `repricer-api-tasks-${new Date().toISOString().slice(0, 10)}.xls`);
  return { ok: true, rows: rows.length, tone: 'ok', message: `Задачи API подготовлены: ${fmt.int(rows.length)} строк.` };
}

function repricerRepairSnapshotFields() {
  return [
    'repricerOverrides',
    'repricerSkuProfiles',
    'repricerCorridors',
    'repricerOverrideDeletes',
    'repricerSkuProfileDeletes',
    'repricerCorridorDeletes',
    'repricerPendingApiAdds',
    'repricerPendingApiDeletes',
    'repricerPendingCostFixes',
    'repricerPendingApiTasks',
    'repricerRepairHistory',
    'repricerApiReconcileHistory',
    'repricerLastAuditImport',
    'repricerLastAutoFix',
    'repricerLastImportValidation',
    'repricerLastApiReconcile'
  ];
}

function repricerCloneValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function repricerCreateRepairSnapshot(kind = 'change', label = '') {
  const now = new Date().toISOString();
  const storage = {};
  repricerRepairSnapshotFields().forEach((field) => {
    storage[field] = repricerCloneValue(state.storage?.[field]);
  });
  const snapshot = {
    id: stableId('repricer-snapshot', `${now}|${kind}|${label}`),
    articleKey: `snapshot-${Date.now()}`,
    kind,
    label: label || kind,
    createdAt: now,
    createdBy: repricerTeamActor(),
    storage
  };
  state.storage.repricerRepairSnapshots = [snapshot, ...(state.storage.repricerRepairSnapshots || [])].slice(0, 10);
  return snapshot;
}

function restoreLastRepricerRepairSnapshot() {
  const snapshot = (state.storage?.repricerRepairSnapshots || [])[0];
  if (!snapshot?.storage) {
    window.alert('Нет сохранённого действия для отката.');
    return false;
  }
  const remaining = (state.storage.repricerRepairSnapshots || []).slice(1);
  repricerRepairSnapshotFields().forEach((field) => {
    state.storage[field] = repricerCloneValue(snapshot.storage[field]);
  });
  state.storage.repricerRepairSnapshots = remaining;
  repricerRecordRepairHistory({
    articleKey: snapshot.articleKey || `snapshot-${Date.now()}`,
    platform: 'all',
    source: 'undo',
    command: 'UNDO',
    result: 'применено',
    before: snapshot.label || snapshot.kind || '',
    after: 'состояние восстановлено',
    details: `Откат: ${snapshot.label || snapshot.kind || 'последнее действие'}`,
    createdAt: new Date().toISOString()
  });
  saveLocalStorage();
  if (typeof persistRepricerControls === 'function') persistRepricerControls().catch((error) => console.error(error));
  renderRepricer();
  window.alert(`Откат выполнен: ${snapshot.label || snapshot.kind || 'последнее действие'}.`);
  return true;
}

function repricerStatusLabel(status = '') {
  const code = String(status || 'open').trim().toLowerCase();
  const map = {
    open: 'новая',
    sent: 'отправлено',
    accepted: 'принято',
    error: 'ошибка',
    skipped: 'пропущено'
  };
  return map[code] || code;
}

function repricerStatusTone(status = '') {
  const code = String(status || 'open').trim().toLowerCase();
  if (code === 'accepted') return 'ok';
  if (code === 'sent') return 'info';
  if (code === 'error') return 'danger';
  return 'warn';
}

function repricerTaskStatus(item = {}, fallback = 'open') {
  return String(item.status || fallback || 'open').trim().toLowerCase();
}

function repricerUpdateApiTaskBuckets(updater) {
  const buckets = ['repricerPendingApiAdds', 'repricerPendingApiDeletes', 'repricerPendingCostFixes', 'repricerPendingApiTasks'];
  buckets.forEach((bucket) => {
    state.storage[bucket] = repricerDedupeQueueItems(bucket, state.storage?.[bucket] || [])
      .map((item) => updater({ ...item }, bucket));
    state.storage[bucket] = repricerDedupeQueueItems(bucket, state.storage[bucket]);
  });
}

function repricerTaskTypeFromBucket(bucket, item = {}) {
  if (item.type || item.action) return String(item.type || item.action).trim().toUpperCase();
  if (bucket === 'repricerPendingApiAdds') return 'ADD_SKU';
  if (bucket === 'repricerPendingApiDeletes') return 'DELETE_SKU';
  if (bucket === 'repricerPendingCostFixes') return 'UPDATE_COST';
  return 'API_TASK';
}

function markRepricerApiTasksSent() {
  const now = new Date().toISOString();
  let changed = 0;
  repricerUpdateApiTaskBuckets((item, bucket) => {
    const type = repricerTaskTypeFromBucket(bucket, item);
    const status = repricerTaskStatus(item);
    if (status === 'open') {
      changed += 1;
      return { ...item, type, action: item.action || type, status: 'sent', sentAt: now, updatedAt: now, sentBy: repricerTeamActor() };
    }
    return { ...item, type, action: item.action || type };
  });
  saveLocalStorage();
  if (typeof persistRepricerControls === 'function') persistRepricerControls().catch((error) => console.error(error));
  renderRepricer();
  window.alert(changed ? `API-задачи помечены как отправленные: ${fmt.int(changed)}.` : 'Новых API-задач для отправки нет.');
}

function repricerCurrentRowMaps() {
  const rows = buildRepricerRows();
  const map = new Map(rows.map((row) => [repricerNormalizeArticleKey(row.articleKey || row.article), row]));
  return { rows, map };
}

function repricerTaskResolvedByCurrentData(task, currentMap) {
  const type = String(task.type || task.action || '').trim().toUpperCase();
  const articleKey = repricerNormalizeArticleKey(task.articleKey || task.article || task.sku);
  const row = currentMap.get(articleKey);
  const platform = repricerQueuePlatform(task.platform);
  const side = platform === 'ozon' ? row?.ozon : (platform === 'wb' ? row?.wb : (row?.wb || row?.ozon));
  if (type === 'ADD_SKU') return Boolean(row);
  if (type === 'DELETE_SKU') return !row;
  if (type === 'UPDATE_COST') return Boolean(side && numberOrZero(side.costRub) > 0);
  if (type === 'UPDATE_MIN_MAX') return Boolean(side && (
    numberOrZero(side.effectiveFloor) > 0
    || numberOrZero(side.hardFloor) > 0
    || numberOrZero(side.capPrice) > 0
    || numberOrZero(side.stretchCap) > 0
  ));
  if (type === 'UPDATE_PRICE_SNAPSHOT') return Boolean(side && numberOrZero(side.currentPrice) > 0);
  if (type === 'UPDATE_SKU_PROFILE') return Boolean(row && (String(row.status || '').trim() || String(row.role || '').trim() || String(row.launchReady || '').trim()));
  if (type === 'UPDATE_SKU_MARGIN') {
    const expected = repricerMarginRatio(task.targetMarginPct ?? task.value);
    const actual = repricerMarginRatio(side?.requiredMarginPct);
    return Boolean(expected > 0 && actual > 0 && Math.abs(expected - actual) < 0.0001);
  }
  return false;
}

function reconcileRepricerApiTasks() {
  const now = new Date().toISOString();
  const { map } = repricerCurrentRowMaps();
  const summary = { checked: 0, accepted: 0, error: 0, open: 0, waiting: 0 };
  repricerUpdateApiTaskBuckets((item, bucket) => {
    const type = repricerTaskTypeFromBucket(bucket, item);
    item = { ...item, type, action: item.action || type };
    const status = repricerTaskStatus(item);
    if (status === 'accepted') return item;
    const resolved = repricerTaskResolvedByCurrentData(item, map);
    summary.checked += 1;
    if (resolved) {
      summary.accepted += 1;
      return { ...item, status: 'accepted', acceptedAt: now, reconciledAt: now, updatedAt: now, resultMessage: 'данные в API/источнике уже отражены' };
    }
    if (status === 'sent' || item.sentAt) {
      summary.waiting += 1;
      return { ...item, status: 'sent', reconciledAt: now, updatedAt: now, resultMessage: 'отправлено, ждём обновления источника' };
    }
    if (status === 'error') {
      summary.open += 1;
      return { ...item, status: 'open', reconciledAt: now, updatedAt: now, resultMessage: 'возвращено в очередь после повторной сверки' };
    }
    summary.open += 1;
    return { ...item, reconciledAt: now, updatedAt: now, resultMessage: 'ждёт отправки в API' };
  });
  const record = {
    id: stableId('repricer-api-check', `${now}|${summary.checked}|${summary.accepted}|${summary.waiting}|${summary.error}`),
    articleKey: `api-check-${Date.now()}`,
    checkedAt: now,
    checkedBy: repricerTeamActor(),
    ...summary
  };
  state.storage.repricerLastApiReconcile = record;
  state.storage.repricerApiReconcileHistory = [record, ...(state.storage.repricerApiReconcileHistory || [])].slice(0, 100);
  saveLocalStorage();
  if (typeof persistRepricerControls === 'function') persistRepricerControls().catch((error) => console.error(error));
  renderRepricer();
  window.alert(`Сверка API: принято ${summary.accepted}, ждёт обновления источника ${summary.waiting}, ждёт отправки ${summary.open}, ошибок ${summary.error}.`);
  return summary;
}

function repricerUpsertImportedOverride(next) {
  const normalized = normalizeRepricerOverride(next);
  const articleKey = normalized.articleKey;
  const platform = normalized.platform;
  state.storage.repricerOverrides = (state.storage.repricerOverrides || []).filter((item) => !(item.articleKey === articleKey && item.platform === platform));
  if (repricerHasOverride(normalized)) {
    clearRepricerDeleteTombstone('repricerOverrideDeletes', articleKey, platform, true);
    state.storage.repricerOverrides.unshift(normalized);
  }
}

function repricerUpsertImportedCorridor(next) {
  const normalized = normalizeRepricerCorridor(next);
  const articleKey = normalized.articleKey;
  const platform = normalized.platform;
  state.storage.repricerCorridors = (state.storage.repricerCorridors || []).filter((item) => !(item.articleKey === articleKey && item.platform === platform));
  if (repricerHasCorridor(normalized)) {
    clearRepricerDeleteTombstone('repricerCorridorDeletes', articleKey, platform, true);
    state.storage.repricerCorridors.unshift(normalized);
  }
}

function repricerUpsertImportedProfile(next) {
  const normalized = normalizeRepricerSkuProfile(next);
  const articleKey = normalized.articleKey;
  state.storage.repricerSkuProfiles = (state.storage.repricerSkuProfiles || []).filter((item) => item.articleKey !== articleKey);
  if (repricerHasSkuProfile(normalized)) {
    clearRepricerDeleteTombstone('repricerSkuProfileDeletes', articleKey, 'all', false);
    state.storage.repricerSkuProfiles.unshift(normalized);
  }
}

function repricerImportResultColumns() {
  return [
    ['article', 'Артикул'],
    ['marketplace', 'Площадка'],
    ['command', 'Команда'],
    ['result', 'Результат'],
    ['details', 'Детали']
  ];
}

function repricerDownloadImportResult(rows) {
  if (!rows.length) return;
  repricerDownloadHtmlTable(repricerImportResultColumns(), rows, `repricer-import-result-${new Date().toISOString().slice(0, 10)}.xls`);
}

function repricerImportDraft(row = {}, fileName = '') {
  const article = repricerImportValue(row, ['article_key', 'article', 'Артикул', 'sku_code', 'SKU', 'Номенклатура']);
  const articleKey = String(article || '').trim();
  const marketplace = repricerImportValue(row, ['marketplace', 'Площадка', 'platform']);
  const platform = repricerImportPlatform(marketplace);
  const commandRaw = repricerImportValue(row, ['import_command', 'Команда', 'Действие', 'action', 'cmd']);
  const price = repricerImportNumber(repricerImportValue(row, ['import_price_rub', 'Новая цена, ₽', 'Новая цена']));
  const margin = repricerImportPercent(repricerImportValue(row, ['import_margin_pct', 'Новая маржа SKU, %', 'Маржа SKU, %', 'target_margin_pct', 'target_margin']));
  const min = repricerImportNumber(repricerImportValue(row, ['import_min_rub', 'Новый MIN, ₽', 'Новый MIN', 'new_min', 'minPrice', 'min_price', 'MIN рекомендованный, ₽']));
  const max = repricerImportNumber(repricerImportValue(row, ['import_max_rub', 'Новый MAX, ₽', 'Новый MAX', 'new_max', 'maxPrice', 'max_price', 'MAX рекомендованный, ₽']));
  const cost = repricerImportNumber(repricerImportValue(row, ['import_cost_rub', 'Новая себестоимость, ₽', 'Новая себестоимость']));
  const status = repricerImportValue(row, ['import_status', 'Новый статус']);
  const role = repricerImportValue(row, ['import_role', 'Новая роль']);
  const launchReady = repricerImportValue(row, ['import_launch_ready', 'Новый launch ready']);
  const importNote = repricerImportValue(row, ['import_note', 'Комментарий для импорта']);
  const note = importNote || `Импорт аудита ${fileName || ''}`.trim();
  const hasImportFields = Boolean(price || margin || min || max || cost || status || role || launchReady || importNote);
  const command = commandRaw ? repricerImportCommand(commandRaw) : (hasImportFields ? 'fix' : '');
  return { articleKey, platform, commandRaw, command, price, margin, min, max, cost, status, role, launchReady, importNote, note, hasImportFields };
}

function validateRepricerAuditImportRows(rows, fileName = '') {
  const currentRows = buildRepricerRows();
  const currentMap = new Map(currentRows.map((row) => [repricerNormalizeArticleKey(row.articleKey || row.article), row]));
  const summary = { fileName, validatedAt: new Date().toISOString(), rows: rows.length, actionable: 0, skipped: 0, errors: 0, warnings: 0, force: 0, fix: 0, hold: 0, off: 0, add: 0, clear: 0, resultRows: [] };
  rows.forEach((row, index) => {
    const draft = repricerImportDraft(row, fileName);
    const result = { article: draft.articleKey, marketplace: draft.platform.toUpperCase(), command: draft.command || draft.commandRaw || 'skip', result: 'ok', details: '' };
    if (!draft.command && !draft.hasImportFields && !draft.commandRaw) {
      summary.skipped += 1;
      result.result = 'пропущено';
      result.details = 'команда и поля импорта пустые';
      summary.resultRows.push(result);
      return;
    }
    summary.actionable += 1;
    if (!draft.articleKey) {
      summary.errors += 1;
      result.result = 'ошибка';
      result.details = `строка ${index + 2}: нет артикула`;
      summary.resultRows.push(result);
      return;
    }
    if (draft.commandRaw && !draft.command) {
      summary.errors += 1;
      result.result = 'ошибка';
      result.details = `строка ${index + 2}: команда не распознана`;
      summary.resultRows.push(result);
      return;
    }
    if (draft.command === 'force' && !draft.price) {
      summary.errors += 1;
      result.result = 'ошибка';
      result.details = `строка ${index + 2}: FORCE без новой цены`;
      summary.resultRows.push(result);
      return;
    }
    if (draft.command === 'fix' && !(draft.price || draft.margin || draft.min || draft.max || draft.cost || draft.status || draft.role || draft.launchReady)) {
      summary.warnings += 1;
      result.result = 'предупреждение';
      result.details = `строка ${index + 2}: FIX без заполняемых полей`;
    }
    if (draft.command === 'add' && currentMap.has(repricerNormalizeArticleKey(draft.articleKey))) {
      summary.warnings += 1;
      result.result = 'предупреждение';
      result.details = `строка ${index + 2}: SKU уже есть в текущем API-срезе`;
    }
    if (draft.command === 'force') summary.force += 1;
    if (draft.command === 'fix') summary.fix += 1;
    if (draft.command === 'hold') summary.hold += 1;
    if (draft.command === 'off') summary.off += 1;
    if (draft.command === 'add') summary.add += 1;
    if (draft.command === 'clear') summary.clear += 1;
    if (!result.details) result.details = 'строка готова к применению';
    summary.resultRows.push(result);
  });
  summary.canApply = summary.errors === 0;
  return summary;
}

function repricerImportValidationMessage(summary) {
  return [
    `Проверка Excel: строк ${fmt.int(summary.rows)}, к применению ${fmt.int(summary.actionable)}, пропущено ${fmt.int(summary.skipped)}.`,
    `Ошибки ${fmt.int(summary.errors)}, предупреждения ${fmt.int(summary.warnings)}.`,
    `Будет: исправить ${fmt.int(summary.fix)}, force ${fmt.int(summary.force)}, hold ${fmt.int(summary.hold)}, удалить/off ${fmt.int(summary.off)}, добавить ${fmt.int(summary.add)}, сброс ${fmt.int(summary.clear)}.`
  ].join('\n');
}

async function repricerApplyImportedPriceOverride({ articleKey, platform, price, note, now, existingSide }) {
  const previous = repricerExactStorageItem('repricerOverrides', articleKey, platform) || {};
  const next = normalizeRepricerOverride({
    ...previous,
    articleKey,
    platform,
    mode: 'force',
    forcePrice: price,
    note,
    updatedAt: now,
    updatedBy: state.team?.member?.name || 'Команда'
  });
  const deltaPct = repricerSharpPriceChange(existingSide?.currentPrice, price);
  if (deltaPct !== null) {
    const decision = await requestRepricerSharpPriceApproval(next, existingSide, deltaPct, { silent: true });
    return { applied: false, approvalPending: true, decision };
  }
  repricerUpsertImportedOverride(next);
  return { applied: true, approvalPending: false, decision: null };
}

async function repricerRequestImportedStatusApproval({ articleKey, platform, status, note, existingRow }) {
  const proposedKey = repricerLifecycleKey(status);
  const currentLifecycle = existingRow?.productLifecycle
    || repricerProductLifecycleForRecord(existingRow || {}, existingRow?.status || '', articleKey);
  const currentKey = repricerLifecycleKey(currentLifecycle?.key || currentLifecycle?.status || existingRow?.status || '');
  if (!proposedKey || proposedKey === currentKey) {
    return { approvalPending: false, unchanged: true, decision: null };
  }
  if (typeof window.requestSkuDecisionApproval !== 'function') {
    throw new Error('Модуль согласования РОПа не загружен; статус не изменён.');
  }
  const proposedMeta = repricerLifecycleMeta(proposedKey, status);
  const decision = await window.requestSkuDecisionApproval({
    type: 'PRODUCT_STATUS_CHANGE',
    articleKey,
    platform: platform || 'all',
    currentValue: currentLifecycle?.label || currentLifecycle?.status || existingRow?.status || '—',
    proposedValue: proposedMeta.label || status,
    reason: note,
    payload: {
      currentStatusKey: currentKey || 'active',
      proposedStatusKey: proposedMeta.key,
      proposedStatusLabel: proposedMeta.label,
      clearOverride: false,
      importSource: true
    }
  });
  return { approvalPending: true, unchanged: false, decision };
}

async function repricerApplyAuditImportRows(rows, fileName = '') {
  const now = new Date().toISOString();
  const currentRows = buildRepricerRows();
  const currentMap = new Map(currentRows.map((row) => [repricerNormalizeArticleKey(row.articleKey || row.article), row]));
  const summary = { applied: 0, skipped: 0, errors: 0, overrides: 0, corridors: 0, profiles: 0, pendingAdds: 0, pendingDeletes: 0, pendingCosts: 0, pendingTasks: 0, history: 0, resultRows: [] };
  for (const row of rows) {
    const { articleKey, platform, commandRaw, command, price, margin, min, max, cost, status, role, launchReady, note } = repricerImportDraft(row, fileName);
    const result = { article: articleKey, marketplace: platform.toUpperCase(), command: command || 'skip', result: '', details: '' };
    if (!articleKey) {
      summary.errors += 1;
      result.result = 'ошибка';
      result.details = 'нет артикула';
      summary.resultRows.push(result);
      continue;
    }
    if (commandRaw && !command) {
      summary.errors += 1;
      result.command = commandRaw;
      result.result = 'ошибка';
      result.details = 'команда не распознана';
      summary.resultRows.push(result);
      continue;
    }
    if (!command || command === 'ignore') {
      summary.skipped += 1;
      result.result = 'пропущено';
      result.details = 'нет команды';
      summary.resultRows.push(result);
      continue;
    }
    const existingRow = currentMap.get(repricerNormalizeArticleKey(articleKey));
    const existingSide = platform === 'ozon' ? existingRow?.ozon : (platform === 'wb' ? existingRow?.wb : (existingRow?.wb || existingRow?.ozon));
    const beforeText = existingSide ? `текущая ${fmt.money(existingSide.currentPrice)}, финал ${fmt.money(existingSide.finalPrice)}` : 'не было в текущем контуре';
    if (command === 'add') {
      repricerUpsertStorageItem('repricerPendingApiAdds', {
        articleKey,
        article: articleKey,
        name: repricerImportValue(row, ['name', 'Название']),
        owner: repricerImportValue(row, ['owner', 'Owner']),
        requestedAt: now,
        requestedBy: state.team?.member?.name || 'Команда',
        note
      }, (item) => String(item.articleKey || '').trim() === articleKey);
      summary.pendingAdds += 1;
      summary.applied += 1;
      result.result = existingRow ? 'уже есть в API' : 'в очередь API';
      result.details = existingRow ? 'добавление не нужно, SKU уже пришел из источника' : 'не включаем в расчет до появления в API';
      repricerRecordRepairHistory({ articleKey, platform, source: 'import', command: 'ADD_SKU', result: result.result, before: beforeText, after: result.details, details: note, createdAt: now });
      summary.history += 1;
      summary.resultRows.push(result);
      continue;
    }
    if (command === 'clear') {
      state.storage.repricerOverrides = (state.storage.repricerOverrides || []).filter((item) => !(item.articleKey === articleKey && (platform === 'all' || item.platform === platform)));
      state.storage.repricerCorridors = (state.storage.repricerCorridors || []).filter((item) => !(item.articleKey === articleKey && (platform === 'all' || item.platform === platform)));
      state.storage.repricerSkuProfiles = (state.storage.repricerSkuProfiles || []).filter((item) => item.articleKey !== articleKey);
      summary.applied += 1;
      result.result = 'сброшено';
      result.details = 'локальные решения по SKU очищены';
      repricerRecordRepairHistory({ articleKey, platform, source: 'import', command: 'CLEAR', result: result.result, before: beforeText, after: result.details, details: note, createdAt: now });
      summary.history += 1;
      summary.resultRows.push(result);
      continue;
    }
    const details = [];
    if (command === 'off') {
      const previous = repricerExactStorageItem('repricerOverrides', articleKey, platform) || {};
      repricerUpsertImportedOverride({ ...previous, articleKey, platform, mode: 'off', note, updatedAt: now, updatedBy: state.team?.member?.name || 'Команда' });
      repricerUpsertStorageItem('repricerPendingApiDeletes', { articleKey, platform, requestedAt: now, requestedBy: state.team?.member?.name || 'Команда', note }, (item) => item.articleKey === articleKey && item.platform === platform);
      summary.overrides += 1;
      summary.pendingDeletes += 1;
      details.push('локально выключено до удаления из API');
    } else if (command === 'hold') {
      const previous = repricerExactStorageItem('repricerOverrides', articleKey, platform) || {};
      repricerUpsertImportedOverride({ ...previous, articleKey, platform, mode: 'hold', note, updatedAt: now, updatedBy: state.team?.member?.name || 'Команда' });
      summary.overrides += 1;
      details.push('поставлен HOLD');
    } else if (command === 'force') {
      if (!price) {
        summary.errors += 1;
        result.result = 'ошибка';
        result.details = 'для FORCE нужна новая цена';
        summary.resultRows.push(result);
        continue;
      }
      const importedPrice = await repricerApplyImportedPriceOverride({ articleKey, platform, price, note, now, existingSide });
      if (importedPrice.approvalPending) {
        summary.pendingTasks += 1;
        details.push(`force price ${fmt.money(price)} ждёт РОПа`);
      } else {
        summary.overrides += 1;
        details.push(`force price ${fmt.money(price)}`);
      }
    }
    if (command === 'fix' || command === 'force') {
      if (min || max) {
        const previous = repricerExactStorageItem('repricerCorridors', articleKey, platform) || {};
        repricerUpsertImportedCorridor({ ...previous, articleKey, platform, hardFloor: min || previous.hardFloor || '', stretchCap: max || previous.stretchCap || '', updatedAt: now, updatedBy: state.team?.member?.name || 'Команда' });
        summary.corridors += 1;
        details.push(`коридор ${min ? `MIN ${fmt.money(min)}` : ''}${max ? ` MAX ${fmt.money(max)}` : ''}`.trim());
        repricerQueueMinMaxTask({ articleKey, platform, min, max, note, requestedAt: now });
        summary.pendingTasks += 1;
      }
      if (price && command === 'fix') {
        const importedPrice = await repricerApplyImportedPriceOverride({ articleKey, platform, price, note, now, existingSide });
        if (importedPrice.approvalPending) {
          summary.pendingTasks += 1;
          details.push(`цена ${fmt.money(price)} ждёт РОПа`);
        } else {
          summary.overrides += 1;
          details.push(`цена ${fmt.money(price)}`);
        }
      }
      if (status) {
        const statusRequest = await repricerRequestImportedStatusApproval({
          articleKey,
          platform,
          status,
          note,
          existingRow
        });
        if (statusRequest.approvalPending) {
          summary.pendingTasks += 1;
          details.push(`статус «${status}» ждёт РОПа`);
        } else {
          details.push(`статус уже «${status}»`);
        }
      }
      if (role || launchReady || margin) {
        const previous = repricerFindSkuProfile(articleKey) || {};
        repricerUpsertImportedProfile({
          ...previous,
          articleKey,
          status: '',
          role: role || previous.role || '',
          launchReady: launchReady || previous.launchReady || '',
          targetMarginPct: margin || previous.targetMarginPct || '',
          updatedAt: now,
          updatedBy: state.team?.member?.name || 'Команда'
        });
        summary.profiles += 1;
        details.push(margin ? `маржа SKU ≥ ${repricerExportNumber(margin * 100, 1)}%` : 'обновлен профиль SKU');
        if (role || launchReady) {
          repricerQueueApiTask({ type: 'UPDATE_SKU_PROFILE', action: 'UPDATE_SKU_PROFILE', articleKey, platform: 'all', field: 'role_launch', value: [role, launchReady].filter(Boolean).join(' / '), note, requestedAt: now });
          summary.pendingTasks += 1;
        }
        if (margin) {
          repricerQueueApiTask({ type: 'UPDATE_SKU_MARGIN', action: 'UPDATE_SKU_MARGIN', articleKey, platform: 'all', field: 'target_margin_pct', value: margin, targetMarginPct: margin, note, requestedAt: now });
          summary.pendingTasks += 1;
        }
      }
      if (cost) {
        repricerUpsertStorageItem('repricerPendingCostFixes', {
          type: 'UPDATE_COST',
          action: 'UPDATE_COST',
          articleKey,
          platform,
          field: 'cost',
          value: cost,
          costRub: cost,
          requestedAt: now,
          requestedBy: state.team?.member?.name || 'Команда',
          note
        }, (item) => item.articleKey === articleKey && item.platform === platform);
        summary.pendingCosts += 1;
        details.push('себестоимость отправлена в очередь API');
      }
    }
    if (!details.length) {
      summary.skipped += 1;
      result.result = 'пропущено';
      result.details = 'нет заполняемых полей';
    } else {
      summary.applied += 1;
      result.result = 'применено';
      result.details = details.join(' · ');
      repricerRecordRepairHistory({ articleKey, platform, source: 'import', command: command.toUpperCase(), result: result.result, before: beforeText, after: result.details, details: note, createdAt: now });
      summary.history += 1;
    }
    summary.resultRows.push(result);
  }
  state.storage.repricerLastAuditImport = {
    fileName,
    importedAt: now,
    applied: summary.applied,
    skipped: summary.skipped,
    errors: summary.errors,
    pendingAdds: summary.pendingAdds,
    pendingDeletes: summary.pendingDeletes,
    pendingCosts: summary.pendingCosts,
    pendingTasks: summary.pendingTasks,
    history: summary.history
  };
  saveLocalStorage();
  if (typeof persistRepricerControls === 'function') persistRepricerControls().catch((error) => console.error(error));
  renderRepricer();
  return summary;
}

async function importRepricerAuditFile(file) {
  if (!file) return;
  const isXlsx = /\.xlsx$/i.test(file.name || '')
    || String(file.type || '').includes('openxmlformats-officedocument.spreadsheetml.sheet');
  const rows = isXlsx
    ? repricerParseXlsxArrayBuffer(await repricerReadFileAsArrayBuffer(file))
    : repricerParseAuditImportText(await repricerReadFileAsText(file));
  if (!rows.length) {
    window.alert('Не удалось прочитать таблицу. Используйте XLSX/XLS/CSV, скачанный из репрайсера.');
    return;
  }
  const workbookMeta = rows.__workbookMeta || {};
  const validation = validateRepricerAuditImportRows(rows, file.name || '');
  state.storage.repricerLastImportValidation = {
    fileName: file.name || '',
    validatedAt: validation.validatedAt,
    rows: validation.rows,
    actionable: validation.actionable,
    skipped: validation.skipped,
    errors: validation.errors,
    warnings: validation.warnings,
    canApply: validation.canApply,
    sheetName: workbookMeta.sheetName || '',
    awaitingRop: numberOrZero(workbookMeta.awaitingRop),
    blockedByWorkbook: numberOrZero(workbookMeta.blocked),
    approvedByWorkbook: numberOrZero(workbookMeta.approved)
  };
  saveLocalStorage();
  if (!validation.actionable && numberOrZero(workbookMeta.awaitingRop) > 0) {
    renderRepricer();
    window.alert(
      `Файл прочитан: ${fmt.int(workbookMeta.awaitingRop)} строк заполнены, но ждут решения РОП.\n\n`
      + 'На листе «Согласование РОП» выберите «Согласовано» для разрешённых строк, сохраните XLSX и загрузите его повторно. До этого маржа и MIN/MAX не применяются.'
    );
    return;
  }
  if (validation.resultRows.length && (validation.errors || validation.warnings)) {
    repricerDownloadHtmlTable(repricerImportResultColumns(), validation.resultRows, `repricer-import-validation-${new Date().toISOString().slice(0, 10)}.xls`);
  }
  const validationText = repricerImportValidationMessage(validation);
  if (!validation.canApply) {
    renderRepricer();
    window.alert(`${validationText}\n\nКритичные ошибки есть, импорт не применён. Скачан файл проверки.`);
    return;
  }
  const shouldApply = window.confirm(`${validationText}\n\nПрименить эти решения? Перед применением будет сохранён откат.`);
  if (!shouldApply) {
    renderRepricer();
    return;
  }
  repricerCreateRepairSnapshot('import', `Перед импортом ${file.name || 'аудита'}`);
  const summary = await repricerApplyAuditImportRows(rows, file.name || '');
  repricerDownloadImportResult(summary.resultRows);
  window.alert(`Импорт решений: применено ${summary.applied}, пропущено ${summary.skipped}, ошибок ${summary.errors}. Очередь API: добавить ${summary.pendingAdds}, удалить ${summary.pendingDeletes}, себестоимость ${summary.pendingCosts}, прочие задачи ${summary.pendingTasks}.`);
}

function previewRepricerSafeFixes(rows = buildRepricerRows()) {
  const summary = { touched: 0, raisedToMin: 0, holds: 0, pendingCost: 0, pendingMinMax: 0, pendingPrice: 0, pendingDeletes: 0, skipped: 0, examples: [] };
  repricerCollectSides(rows).forEach(({ row, platformLabel, side }) => {
    if (!side) return;
    const flags = repricerIssueFlags(side);
    const details = [];
    if (side.outOfSpec || side.criticalGate === 'SKIP') {
      summary.pendingDeletes += 1;
      details.push('OFF + DELETE_SKU');
    } else {
      if (flags.belowMin && numberOrZero(side.effectiveFloor) > 0) {
        summary.raisedToMin += 1;
        details.push(`до MIN ${fmt.money(side.effectiveFloor)}`);
      }
      if (flags.missingPrice) {
        summary.holds += 1;
        summary.pendingPrice += 1;
        details.push('HOLD + price snapshot');
      }
      if (flags.missingCost) {
        summary.pendingCost += 1;
        details.push('UPDATE_COST');
      }
      if (flags.missingMin) {
        summary.pendingMinMax += 1;
        details.push('UPDATE_MIN_MAX');
      }
    }
    if (details.length) {
      summary.touched += 1;
      if (summary.examples.length < 5) summary.examples.push(`${row.article || row.articleKey} · ${platformLabel}: ${details.join(', ')}`);
    } else {
      summary.skipped += 1;
    }
  });
  return summary;
}

function repricerSafeFixPreviewMessage(summary) {
  const lines = [
    `Предпросмотр безопасного автопочина: будет обработано ${fmt.int(summary.touched)} строк.`,
    `До MIN: ${fmt.int(summary.raisedToMin)}, HOLD: ${fmt.int(summary.holds)}, удалить/OFF: ${fmt.int(summary.pendingDeletes)}.`,
    `API-задачи: себестоимость ${fmt.int(summary.pendingCost)}, MIN/MAX ${fmt.int(summary.pendingMinMax)}, текущая цена ${fmt.int(summary.pendingPrice)}.`
  ];
  if (summary.examples.length) lines.push(`Примеры:\n${summary.examples.join('\n')}`);
  lines.push('Применить? Перед применением будет сохранён откат.');
  return lines.join('\n\n');
}

function applyRepricerSafeFixes() {
  const now = new Date().toISOString();
  const rows = buildRepricerRows();
  const preview = previewRepricerSafeFixes(rows);
  if (!preview.touched) {
    window.alert('Безопасных автоматических правок сейчас нет.');
    return preview;
  }
  if (!window.confirm(repricerSafeFixPreviewMessage(preview))) return preview;
  repricerCreateRepairSnapshot('safe_fix', 'Перед безопасным автопочином');
  const summary = {
    raisedToMin: 0,
    holds: 0,
    pendingCost: 0,
    pendingMinMax: 0,
    pendingPrice: 0,
    pendingDeletes: 0,
    touched: 0,
    skipped: 0,
    history: 0,
    resultRows: []
  };
  repricerCollectSides(rows).forEach(({ row, platform, platformLabel, side }) => {
    if (!side) return;
    const articleKey = String(row.articleKey || row.article || side.articleKey || '').trim();
    if (!articleKey) return;
    const flags = repricerIssueFlags(side);
    const details = [];
    const beforeText = `текущая ${fmt.money(side.currentPrice)}, финал ${fmt.money(side.finalPrice)}`;
    const baseTask = {
      articleKey,
      article: row.article || articleKey,
      platform,
      name: row.name || '',
      owner: repricerOwnerForPlatform(row, String(platformLabel || '').toLowerCase()) || '',
      requestedAt: now,
      requestedBy: repricerTeamActor()
    };
    const note = `Безопасный автопочин ${fmt.date(now)}`;
    if (side.outOfSpec || side.criticalGate === 'SKIP') {
      const previous = repricerExactStorageItem('repricerOverrides', articleKey, platform) || {};
      repricerUpsertImportedOverride({ ...previous, articleKey, platform, mode: 'off', note, updatedAt: now, updatedBy: repricerTeamActor() });
      repricerUpsertStorageItem('repricerPendingApiDeletes', { ...baseTask, note: 'Позиция вне ценового контура, удалить или выключить в API' }, (item) => item.articleKey === articleKey && repricerQueuePlatform(item.platform) === platform);
      summary.pendingDeletes += 1;
      details.push('OFF + задача DELETE_SKU');
    } else {
      const floor = Math.ceil(numberOrZero(side.effectiveFloor));
      if (flags.belowMin && floor > 0) {
        const previous = repricerExactStorageItem('repricerOverrides', articleKey, platform) || {};
        repricerUpsertImportedOverride({ ...previous, articleKey, platform, mode: 'force', forcePrice: floor, note, updatedAt: now, updatedBy: repricerTeamActor() });
        summary.raisedToMin += 1;
        details.push(`цена поднята до MIN ${fmt.money(floor)}`);
      }
      if (flags.missingPrice) {
        const previous = repricerExactStorageItem('repricerOverrides', articleKey, platform) || {};
        repricerUpsertImportedOverride({ ...previous, articleKey, platform, mode: 'hold', note, updatedAt: now, updatedBy: repricerTeamActor() });
        repricerQueueApiTask({ ...baseTask, type: 'UPDATE_PRICE_SNAPSHOT', action: 'UPDATE_PRICE_SNAPSHOT', field: 'current_price', note: 'Нет текущей цены площадки, нужен свежий price snapshot' });
        summary.holds += 1;
        summary.pendingPrice += 1;
        details.push('HOLD + задача UPDATE_PRICE_SNAPSHOT');
      }
      if (flags.missingCost) {
        repricerUpsertStorageItem('repricerPendingCostFixes', { ...baseTask, costRub: '', note: 'Нет себестоимости / fee stack, нужна правка в API' }, (item) => item.articleKey === articleKey && repricerQueuePlatform(item.platform) === platform);
        summary.pendingCost += 1;
        details.push('задача UPDATE_COST');
      }
      if (flags.missingMin) {
        repricerQueueApiTask({ ...baseTask, type: 'UPDATE_MIN_MAX', action: 'UPDATE_MIN_MAX', field: 'min_max', note: 'Нет рабочего MIN/MAX, нужна правка в источнике цен' });
        summary.pendingMinMax += 1;
        details.push('задача UPDATE_MIN_MAX');
      }
    }
    if (details.length) {
      summary.touched += 1;
      const afterText = details.join(' · ');
      summary.resultRows.push({
        article: articleKey,
        marketplace: platformLabel,
        command: 'SAFE_FIX',
        result: 'применено',
        details: afterText
      });
      repricerRecordRepairHistory({ articleKey, article: row.article || articleKey, platform, source: 'safe_fix', command: 'SAFE_FIX', result: 'применено', before: beforeText, after: afterText, details: note, createdAt: now });
      summary.history += 1;
    } else {
      summary.skipped += 1;
    }
  });
  state.storage.repricerLastAutoFix = {
    appliedAt: now,
    touched: summary.touched,
    skipped: summary.skipped,
    raisedToMin: summary.raisedToMin,
    holds: summary.holds,
    pendingCost: summary.pendingCost,
    pendingMinMax: summary.pendingMinMax,
    pendingPrice: summary.pendingPrice,
    pendingDeletes: summary.pendingDeletes,
    history: summary.history
  };
  saveLocalStorage();
  if (typeof persistRepricerControls === 'function') persistRepricerControls().catch((error) => console.error(error));
  renderRepricer();
  if (summary.resultRows.length) repricerDownloadImportResult(summary.resultRows);
  window.alert(`Безопасный автопочин: обработано ${summary.touched}. До MIN: ${summary.raisedToMin}, HOLD: ${summary.holds}, задачи API: cost ${summary.pendingCost}, MIN/MAX ${summary.pendingMinMax}, цена ${summary.pendingPrice}, удалить ${summary.pendingDeletes}.`);
  return summary;
}

function repricerExportRows(platform = 'all', sourceRows = null) {
  const rows = Array.isArray(sourceRows) ? sourceRows : buildRepricerRows();
  return rows.flatMap((row) => {
    const sides = [];
    if ((platform === 'all' || platform === 'wb') && row.wb) sides.push(['WB', row.wb]);
    if ((platform === 'all' || platform === 'ozon') && row.ozon) sides.push(['Ozon', row.ozon]);
    return sides.map(([platformLabel, side]) => {
      const pricingBaseRub = numberOrZero(side.finalPrice) || numberOrZero(side.currentPrice);
      const revenueFactor = side.canonicalSource ? 1 : (numberOrZero(side.buyerDiscountFactor) || 1);
      const revenueBaseRub = pricingBaseRub * revenueFactor;
      const advertisingPct = numberOrZero(side.internalAdvertisingPctValue);
      const advertisingFixedRub = numberOrZero(side.internalAdvertisingRub);
      const advertisingAppliedRub = revenueBaseRub * advertisingPct + advertisingFixedRub;
      const commissionAppliedRub = revenueBaseRub * numberOrZero(side.commissionPctValue);
      const advertisingSnapshot = state.repricerLiveSignals?.platforms?.[String(side.platform || platformLabel || '').toLowerCase()]?.advertising
        || state.repricer_live_signals?.platforms?.[String(side.platform || platformLabel || '').toLowerCase()]?.advertising
        || {};
      const advertisingObservedPct = side.internalAdvertisingObservedPctValue == null
        ? numberOrZero(advertisingSnapshot.observedPct)
        : numberOrZero(side.internalAdvertisingObservedPctValue);
      const advertisingStatus = side.internalAdvertisingStatus || advertisingSnapshot.status || '';
      const advertisingSource = [...new Set([
        side.internalAdvertisingSource,
        advertisingSnapshot.source
      ].map((value) => String(value || '').trim()).filter(Boolean))].join(' + ');
      const advertisingAsOf = side.internalAdvertisingAsOf || advertisingSnapshot.to || '';
      const totalCostsAtPriceRub = numberOrZero(side.costRub)
        + numberOrZero(side.platformCostsRub)
        + advertisingAppliedRub
        + commissionAppliedRub;
      return {
      import_margin_pct: '',
      import_command: '',
      import_price_rub: '',
      import_min_rub: '',
      import_max_rub: '',
      import_cost_rub: '',
      import_status: '',
      import_role: '',
      import_launch_ready: '',
      import_note: '',
      command_hint: repricerCommandHint(side),
      recommended_action: repricerRecommendedAction(side),
      fix_team: repricerFixTeamLabel(repricerFixTeamKey(side)),
      price_trace: repricerPriceTrace(row, side),
      generated_at: state.smartPriceWorkbench?.generatedAt || '',
      marketplace: platformLabel,
      brand: row.brand || '',
      article_key: row.articleKey,
      article: row.article || row.articleKey,
      name: row.name || '',
      owner: repricerOwnerForPlatform(row, String(platformLabel || '').toLowerCase()) || '',
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
      confidence: repricerConfidenceLabel(side.confidence),
      confidence_score: repricerExportNumber(side.confidenceScore),
      safe_export: side.safeToExport || side.promoSafeToExport ? 'yes' : 'no',
      decision_text: side.decisionText || '',
      confidence_reasons: Array.isArray(side.confidenceReasons) ? side.confidenceReasons.join(' · ') : '',
      hard_floor_rub: repricerExportNumber(side.hardFloor),
      b2b_floor_rub: repricerExportNumber(side.b2bFloor),
      economic_floor_rub: repricerExportNumber(side.economicFloor),
      economic_floor_fee_rub: repricerExportNumber(side.economicFloorByFee),
      economic_floor_fallback_rub: repricerExportNumber(side.economicFloorFallback),
      economic_floor_source: side.economicFloorSource || '',
      floor_source: side.floorSourceSummary || '',
      cost_rub: repricerExportNumber(side.costRub),
      platform_commission_pct: side.commissionPctValue == null ? '' : repricerExportNumber(side.commissionPctValue * 100, 2),
      platform_commission_rub: repricerExportNumber(commissionAppliedRub),
      platform_costs_rub: repricerExportNumber(side.platformCostsRub),
      internal_advertising_pct: side.internalAdvertisingPctValue == null ? '' : repricerExportNumber(side.internalAdvertisingPctValue * 100, 3),
      internal_advertising_observed_pct: repricerExportNumber(advertisingObservedPct * 100, 3),
      internal_advertising_applied_rub: repricerExportNumber(advertisingAppliedRub),
      internal_advertising_rub: repricerExportNumber(side.internalAdvertisingRub),
      internal_advertising_snapshot_spend_rub: repricerExportNumber(advertisingSnapshot.spendRub),
      internal_advertising_snapshot_revenue_rub: repricerExportNumber(advertisingSnapshot.revenueRub),
      internal_advertising_status: advertisingStatus,
      internal_advertising_source: advertisingSource,
      internal_advertising_as_of: advertisingAsOf,
      total_costs_at_price_rub: repricerExportNumber(totalCostsAtPriceRub),
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
      arrival_price_signal: side.arrivalPriceSignal?.needsCheck ? 'yes' : (side.arrivalPriceSignal?.hasMovement ? 'ok' : ''),
      arrival_platform_stock_units: repricerExportNumber(side.arrivalPriceSignal?.platformStock),
      arrival_shipped_units: repricerExportNumber(side.arrivalPriceSignal?.shippedUnits),
      arrival_inbound_units: repricerExportNumber(side.arrivalPriceSignal?.inboundUnits),
      arrival_price_reasons: side.arrivalPriceSignal?.needsCheck ? (side.arrivalPriceSignal.reasons || []).join(' · ') : '',
      lead_time_days: repricerExportNumber(side.leadTimeDays),
      alignment_eligible: side.eligibleAlignment ? 'yes' : 'no',
      alignment_delta_gate: side.deltaGate ? 'yes' : 'no',
      alignment_scenario: side.chosenScenario || '',
      alignment_keep_score: repricerExportNumber(side.keepScore, 0),
      alignment_follow_score: repricerExportNumber(side.followScore, 0),
      alignment_follow_price_rub: repricerExportNumber(side.followPrice),
      margin_pct: side.marginPct == null ? '' : repricerExportNumber(side.marginPct * 100, 1),
      required_margin_pct: side.requiredMarginPct == null ? '' : repricerExportNumber(side.requiredMarginPct * 100, 1),
      margin_floor_rub: repricerExportNumber(side.marginFloor),
      margin_policy_source: side.marginPolicySource || '',
      margin_guard_required: side.marginGuardRequired ? 'yes' : 'no',
      margin_priority_applied: side.marginPriorityApplied ? 'yes' : 'no',
      cap_lifted_by_margin: side.capLiftedByMargin ? 'yes' : 'no',
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
      current_price_date: side.currentPriceDate || '',
      history_freshness_date: side.historyFreshnessDate || ''
      };
    });
  });
}

function downloadRepricerExcel(platform = 'all', sourceRows = null) {
  const rows = repricerExportRows(platform, sourceRows);
  if (!rows.length) return { ok: false, rows: 0, tone: 'warn', message: 'В рабочем Excel нет строк для выгрузки.' };
  const columns = [
    ['import_margin_pct', 'Новая маржа SKU, %'],
    ['import_command', 'Команда'],
    ['import_price_rub', 'Новая цена, ₽'],
    ['import_min_rub', 'Новый MIN, ₽'],
    ['import_max_rub', 'Новый MAX, ₽'],
    ['import_cost_rub', 'Новая себестоимость, ₽'],
    ['import_status', 'Новый статус'],
    ['import_role', 'Новая роль'],
    ['import_launch_ready', 'Новый launch ready'],
    ['import_note', 'Комментарий для импорта'],
    ['command_hint', 'Что написать в Команда'],
    ['recommended_action', 'Рекомендованное действие'],
    ['fix_team', 'Кто чинит'],
    ['price_trace', 'Почему цена такая'],
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
    ['confidence', 'Confidence'],
    ['confidence_score', 'Confidence score'],
    ['safe_export', 'В безопасной выгрузке'],
    ['decision_text', 'Решение'],
    ['confidence_reasons', 'Причины проверки'],
    ['hard_floor_rub', 'Hard floor, ₽'],
    ['b2b_floor_rub', 'B2B floor, ₽'],
    ['economic_floor_rub', 'Economic floor, ₽'],
    ['economic_floor_fee_rub', 'Economic floor fee, ₽'],
    ['economic_floor_fallback_rub', 'Economic floor fallback, ₽'],
    ['economic_floor_source', 'Economic source'],
    ['cost_rub', 'Себестоимость, ₽'],
    ['platform_commission_pct', 'Комиссия площадки, %'],
    ['platform_commission_rub', 'Комиссия в финальной цене, ₽'],
    ['platform_costs_rub', 'Издержки площадки без рекламы, ₽'],
    ['internal_advertising_pct', 'Внутренняя реклама применена, %'],
    ['internal_advertising_observed_pct', 'Фактический ДРР за окно, %'],
    ['internal_advertising_applied_rub', 'Реклама в финальной цене, ₽'],
    ['internal_advertising_rub', 'Доп. реклама фиксированная, ₽/шт.'],
    ['internal_advertising_snapshot_spend_rub', 'Расход рекламы платформы за окно, ₽'],
    ['internal_advertising_snapshot_revenue_rub', 'Выручка платформы за окно, ₽'],
    ['internal_advertising_status', 'Статус данных рекламы'],
    ['internal_advertising_source', 'Источник данных рекламы'],
    ['internal_advertising_as_of', 'Реклама актуальна на'],
    ['total_costs_at_price_rub', 'Себестоимость + комиссия + издержки + реклама, ₽'],
    ['fee_stack_rub', 'Всего фиксированных издержек, ₽'],
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
    ['arrival_price_signal', 'Авто-сигнал цена'],
    ['arrival_platform_stock_units', 'На площадке, шт.'],
    ['arrival_shipped_units', 'Отгружено, шт.'],
    ['arrival_inbound_units', 'В пути MP, шт.'],
    ['arrival_price_reasons', 'Причина авто-сигнала'],
    ['lead_time_days', 'Lead time, дн.'],
    ['alignment_eligible', 'Align eligible'],
    ['alignment_delta_gate', 'Align delta gate'],
    ['alignment_scenario', 'Align scenario'],
    ['alignment_keep_score', 'Keep score'],
    ['alignment_follow_score', 'Follow score'],
    ['alignment_follow_price_rub', 'Follow price, ₽'],
    ['margin_pct', 'Маржа, %'],
    ['required_margin_pct', 'Порог маржи, %'],
    ['margin_floor_rub', 'Floor маржи, ₽'],
    ['margin_policy_source', 'Источник маржи'],
    ['margin_guard_required', 'Маржа обязательна'],
    ['margin_priority_applied', 'Маржа приоритетна'],
    ['cap_lifted_by_margin', 'MAX поднят маржой'],
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
    ['current_price_date', 'Дата текущей цены'],
    ['history_freshness_date', 'История до']
  ];
  repricerDownloadHtmlTable(columns, rows, `repricer-workbook-${platform}-${new Date().toISOString().slice(0, 10)}.xls`);
  return { ok: true, rows: rows.length, tone: 'ok', message: `Рабочий Excel подготовлен: ${fmt.int(rows.length)} строк.` };
}

function repricerSkuMarginExportRows(sourceRows = null) {
  const rows = Array.isArray(sourceRows) ? sourceRows : buildRepricerRows();
  return rows.map((row) => {
    const articleKey = String(row.articleKey || row.article || '').trim();
    const sides = [
      row.wb ? ['WB', row.wb] : null,
      row.ozon ? ['Ozon', row.ozon] : null
    ].filter(Boolean);
    const profile = repricerFindSkuProfile(articleKey) || {};
    const sideMargin = sides
      .map(([, side]) => side?.requiredMarginPct)
      .find((value) => Number.isFinite(Number(value)) && Number(value) > 0);
    const currentMargin = Number(profile.targetMarginPct) > 0
      ? Number(profile.targetMarginPct)
      : (Number(sideMargin) > 0 ? Number(sideMargin) : null);
    const marginRequired = sides.some(([, side]) => side?.marginGuardRequired);
    const marginMissing = sides.some(([, side]) => side?.marginPolicyMissing);
    const lifecycle = row.productLifecycle || repricerProductLifecycleForRecord(row, row.status || '', articleKey);
    return {
      import_margin_pct: '',
      article_key: articleKey,
      article: row.article || articleKey,
      name: row.name || '',
      status: lifecycle?.label || lifecycle?.status || row.status || '',
      current_margin_pct: currentMargin == null ? '' : repricerExportNumber(currentMargin * 100, 1),
      margin_guard_required: marginRequired ? 'да' : 'нет',
      margin_missing: marginMissing ? 'нужно заполнить' : '',
      marketplaces: sides.map(([label]) => label).join(' + '),
      import_note: '',
      fill_hint: 'Заполните только «Новая маржа SKU, %»: 25, 25% или 0,25. Пусто = не менять.'
    };
  }).filter((row) => row.article_key)
    .sort((left, right) => Number(Boolean(right.margin_missing)) - Number(Boolean(left.margin_missing))
      || String(left.article || left.article_key).localeCompare(String(right.article || right.article_key), 'ru'));
}

function downloadRepricerSkuMarginExcel(sourceRows = null) {
  const rows = repricerSkuMarginExportRows(sourceRows);
  if (!rows.length) return { ok: false, rows: 0, tone: 'warn', message: 'Нет SKU для заполнения маржи.' };
  const columns = [
    ['import_margin_pct', 'Новая маржа SKU, %'],
    ['article_key', 'article_key'],
    ['article', 'Артикул'],
    ['name', 'Название'],
    ['status', 'Статус товара'],
    ['current_margin_pct', 'Текущая маржа SKU, %'],
    ['margin_guard_required', 'Маржа обязательна'],
    ['margin_missing', 'Что сделать'],
    ['marketplaces', 'Площадки'],
    ['import_note', 'Комментарий для импорта'],
    ['fill_hint', 'Как заполнить']
  ];
  const filename = `repricer-sku-margin-${new Date().toISOString().slice(0, 10)}.xls`;
  repricerDownloadHtmlTable(columns, rows, filename);
  return {
    ok: true,
    rows: rows.length,
    tone: 'ok',
    filename,
    message: `Файл маржи SKU подготовлен: ${fmt.int(rows.length)} товаров. Заполните «Новая маржа SKU, %» и загрузите файл обратно.`
  };
}

function repricerExportTemplateRows(platform, options = {}) {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const promoOnly = Boolean(options.promoOnly);
  const normalizedPlatform = platform === 'ozon' ? 'ozon' : 'wb';
  const rows = Array.isArray(options.rows) ? options.rows : buildRepricerRows();
  return repricerCollectSides(rows, platform)
    .filter(({ side }) => !side.outOfSpec)
    .filter(({ side }) => promoOnly ? side.promoActive : !side.promoActive)
    .filter(({ side }) => promoOnly ? side.promoSafeToExport : side.safeToExport)
    .map(({ row, side }) => {
      const commentParts = [`portal repricer ${normalizedPlatform}`];
      if (side.decisionText) commentParts.push(side.decisionText);
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
        confidence: repricerConfidenceLabel(side.confidence),
        confidence_score: repricerExportNumber(side.confidenceScore),
        decision_text: side.decisionText || '',
        reason_code: side.finalReasonCode || side.reasonCode || '',
        load_ts: now,
        comment: commentParts.join(' · ')
      };
    });
}

function repricerTemplateColumns(platform) {
  return [
    ['sku_code', 'sku_code'],
    ['final_price', 'final_price'],
    ['action', platform === 'ozon' ? 'auto_action' : 'discount_flag'],
    ['confidence', 'confidence'],
    ['confidence_score', 'confidence_score'],
    ['decision_text', 'decision_text'],
    ['reason_code', 'reason_code'],
    ['load_ts', 'load_ts'],
    ['comment', 'comment']
  ];
}

function downloadRepricerTemplateEmptyAudit(platform, stats, sourceRows = null) {
  const normalizedPlatform = platform === 'ozon' ? 'ozon' : 'wb';
  const platformLabel = normalizedPlatform === 'ozon' ? 'Ozon' : 'WB';
  const reasonText = repricerTemplateEmptyReason(stats);
  const issueRows = repricerIssueRows('all', sourceRows)
    .filter((row) => String(row.marketplace || '').toLowerCase() === platformLabel.toLowerCase());
  const rows = issueRows.length ? issueRows : [{
    generated_at: state.smartPriceWorkbench?.generatedAt || '',
    batch: 'шаблон пуст',
    priority: 0,
    marketplace: platformLabel,
    article_key: '',
    article: '',
    name: '',
    owner: '',
    brand: '',
    status: '',
    confidence: '',
    confidence_score: '',
    reason: 'шаблон пуст',
    where_fix: 'Аудит',
    what_to_fill: reasonText,
    proposal_no_write: reasonText,
    current_price_rub: '',
    final_price_rub: '',
    min_rub: '',
    cost_rub: '',
    live_rec_price_rub: '',
    decision_text: '',
    confidence_reasons: '',
    safe_export: 'no',
    reason_code: '',
    import_command: '',
    import_price_rub: '',
    import_min_rub: '',
    import_max_rub: '',
    import_cost_rub: '',
    import_status: '',
    import_role: '',
    import_launch_ready: '',
    import_note: '',
    command_hint: 'исправить причины и пересчитать',
    recommended_action: reasonText,
    fix_team: 'Аудит',
    price_trace: ''
  }];
  repricerDownloadHtmlTable(repricerIssueColumns(), rows, `repricer-template-empty-${normalizedPlatform}-audit-${new Date().toISOString().slice(0, 10)}.xls`);
  return { ok: false, rows: 0, tone: 'warn', message: `Шаблон ${platformLabel} пуст. Скачан аудит причин: ${fmt.int(rows.length)} строк.` };
}

function downloadRepricerTemplateExcel(platform, sourceRows = null, statsArg = null) {
  const normalizedPlatform = platform === 'ozon' ? 'ozon' : 'wb';
  const platformLabel = normalizedPlatform === 'ozon' ? 'Ozon' : 'WB';
  const rows = Array.isArray(sourceRows) ? sourceRows : buildRepricerRows();
  const templateRows = repricerExportTemplateRows(normalizedPlatform, { rows });
  const columns = repricerTemplateColumns(normalizedPlatform);
  if (!templateRows.length) {
    const stats = statsArg || repricerTemplateStats(rows, normalizedPlatform);
    repricerDownloadHtmlTable(columns, [], `repricer-upload-${normalizedPlatform}-${new Date().toISOString().slice(0, 10)}.xls`, { allowEmpty: true });
    return {
      ok: true,
      rows: 0,
      tone: 'warn',
      message: `Шаблон ${platformLabel} скачан, но обычных строк 0: проверьте промо-шаблон или аудит причин.`
    };
  }
  repricerDownloadHtmlTable(columns, templateRows, `repricer-upload-${normalizedPlatform}-${new Date().toISOString().slice(0, 10)}.xls`);
  return { ok: true, rows: templateRows.length, tone: 'ok', message: `Шаблон ${platformLabel} подготовлен: ${fmt.int(templateRows.length)} строк.` };
}

function downloadRepricerPromoTemplateExcel(platform, sourceRows = null) {
  const normalizedPlatform = platform === 'ozon' ? 'ozon' : 'wb';
  const rows = Array.isArray(sourceRows) ? sourceRows : buildRepricerRows();
  const templateRows = repricerExportTemplateRows(normalizedPlatform, { promoOnly: true, rows });
  if (!templateRows.length) {
    return { ok: false, rows: 0, tone: 'warn', message: `В ${normalizedPlatform.toUpperCase()} сейчас нет зелёных акционных строк для безопасной выгрузки.` };
  }
  const columns = repricerTemplateColumns(normalizedPlatform);
  repricerDownloadHtmlTable(columns, templateRows, `repricer-promo-upload-${normalizedPlatform}-${new Date().toISOString().slice(0, 10)}.xls`);
  return { ok: true, rows: templateRows.length, tone: 'ok', message: `Промо-шаблон ${normalizedPlatform.toUpperCase()} подготовлен: ${fmt.int(templateRows.length)} строк.` };
}

function repricerListSizeLimit(mode = 'focus') {
  if (mode === 'expanded') return 60;
  if (mode === 'all') return Number.POSITIVE_INFINITY;
  return 20;
}

function repricerEconomicSourceLabel(source = 'all') {
  const map = {
    all: 'все варианты экономики',
    ready: 'экономика подтверждена',
    fee_stack: 'себестоимость + комиссии',
    snapshot_guard: 'себестоимость есть, с guard',
    snapshot_fallback: 'fallback экономика'
  };
  return map[source] || map.all;
}

function repricerPriorityScore(row) {
  const sides = [row?.wb, row?.ozon].filter(Boolean);
  let score = 0;
  if (row?.blocked || row?.blockedByGate || sides.some((side) => side?.criticalGate === 'BLOCK')) score += 100;
  if (row?.arrivalPriceCheck || sides.some((side) => side?.arrivalPriceSignal?.needsCheck)) score += 80;
  if (row?.belowFloorNow || sides.some((side) => side?.belowFloorNow)) score += 50;
  if (row?.marginRisk || sides.some((side) => side?.marginRisk)) score += 45;
  if (row?.changed) score += 30;
  if (row?.hasManualOverride || sides.some((side) => side?.hasOverride)) score += 20;
  if (row?.liveDrift || sides.some((side) => side?.liveDrift)) score += 12;
  if (!row?.owner) score += 8;
  return score;
}

function repricerVisibleRows(rows) {
  const mode = state.repricerFilters.listSize || 'focus';
  const limit = repricerListSizeLimit(mode);
  if (!Number.isFinite(limit)) return rows;
  return [...rows]
    .sort((left, right) => repricerPriorityScore(right) - repricerPriorityScore(left) || String(left.name || '').localeCompare(String(right.name || ''), 'ru'))
    .slice(0, limit);
}

function repricerOperatorLayer() {
  const ui = ensureRepricerUiState();
  return ui.operatorLayer === 'advanced' && window.__ALTEA_REPRICER_ADVANCED_SESSION__ === true ? 'advanced' : 'simple';
}

function repricerRenderSignature(operatorLayer = repricerOperatorLayer()) {
  const filters = state.repricerFilters || {};
  const ui = state.repricerUi || {};
  return [
    operatorLayer,
    repricerRowsCacheSignature(),
    filters.search || '',
    filters.platform || '',
    filters.mode || '',
    filters.economicSource || '',
    filters.listSize || '',
    JSON.stringify(ui.sections || {}),
    JSON.stringify(ui.history || {}),
    JSON.stringify(ui.controls || {}),
    state.repricerShadowReport?.generatedAt || '',
    state.repricerShadowReport?.cutover_allowed === true ? 'canonical-active' : 'legacy-shadow',
    state.repricerLivePrices?.generatedAt || '',
    state.repricerMarginMinMaxGaps?.generatedAt || '',
    state.repricerMarginMinMaxGaps?.summary?.blockedRows || 0
  ].join('||');
}

function setRepricerOperatorLayer(layer) {
  const ui = ensureRepricerUiState();
  ui.operatorLayer = layer === 'advanced' ? 'advanced' : 'simple';
  window.__ALTEA_REPRICER_ADVANCED_SESSION__ = ui.operatorLayer === 'advanced';
  renderRepricer();
}

function repricerArrivalSignalStats(rows = []) {
  const stats = {
    total: { movement: 0, check: 0, ok: 0 },
    wb: { movement: 0, check: 0, ok: 0 },
    ozon: { movement: 0, check: 0, ok: 0 },
    queue: []
  };
  repricerCollectSides(rows).forEach(({ row, platform, platformLabel, side }) => {
    const signal = side?.arrivalPriceSignal;
    if (!signal?.hasMovement) return;
    stats.total.movement += 1;
    stats[platform].movement += 1;
    if (signal.needsCheck) {
      stats.total.check += 1;
      stats[platform].check += 1;
      stats.queue.push({ row, side, platform, platformLabel, signal });
    } else {
      stats.total.ok += 1;
      stats[platform].ok += 1;
    }
  });
  stats.queue.sort((left, right) => numberOrZero(right.signal?.priorityScore) - numberOrZero(left.signal?.priorityScore)
    || String(left.row?.article || left.row?.articleKey || '').localeCompare(String(right.row?.article || right.row?.articleKey || ''), 'ru'));
  return stats;
}

function renderRepricerArrivalPriceSignalCard(rows = []) {
  const stats = repricerArrivalSignalStats(rows);
  const queueMarkup = stats.queue.slice(0, 5).map(({ row, signal, platformLabel }) => `
    <div class="repricer-operator-sku">
      <div>
        <strong>${linkToSku(row.articleKey, row.article || row.articleKey)} · ${escapeHtml(platformLabel)}</strong>
        <span>${escapeHtml(row.name || row.owner || 'Без названия')}</span>
        <span>${escapeHtml(`${signal.stockLabel} · ${signal.reasons.slice(0, 3).join(' · ')}`)}</span>
      </div>
      ${badge(signal.tone === 'danger' ? 'срочно' : 'проверить', signal.tone || 'warn')}
    </div>
  `).join('');
  const tone = stats.total.check ? 'warn' : (stats.total.movement ? 'ok' : 'info');
  return `
    <div class="repricer-operator-focus-card repricer-arrival-price-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Авто-сигнал: товар пришёл → цена</h3>
          <p class="small muted">Когда по WB/Ozon есть товар на площадке, отгрузка или входящий остаток, портал отдельно проверяет цену и поднимает карточки с рисками наверх.</p>
        </div>
        ${badge(stats.total.check ? `проверить ${fmt.int(stats.total.check)}` : 'сигнал чистый', tone)}
      </div>
      <div class="badge-stack" style="margin-top:10px">
        ${badge(`WB проверить ${fmt.int(stats.wb.check)}/${fmt.int(stats.wb.movement)}`, stats.wb.check ? 'warn' : 'ok')}
        ${badge(`Ozon проверить ${fmt.int(stats.ozon.check)}/${fmt.int(stats.ozon.movement)}`, stats.ozon.check ? 'warn' : 'ok')}
        ${badge(`без замечаний ${fmt.int(stats.total.ok)}`, stats.total.ok ? 'ok' : 'info')}
      </div>
      <div class="quick-actions" style="margin-top:12px">
        <button type="button" class="quick-chip ${stats.total.check ? 'warn' : ''}" data-repricer-open-filter="arrival_price_check" ${stats.total.check ? '' : 'disabled aria-disabled="true"'}>Открыть сигнал ${fmt.int(stats.total.check)}</button>
      </div>
      <div class="repricer-operator-sku-list" style="margin-top:12px">${queueMarkup || '<div class="muted small">Сейчас нет товаров, где приход/отгрузка требует отдельной проверки цены.</div>'}</div>
    </div>
  `;
}

function renderRepricerRepairStatusCard() {
  const api = repricerApiQueueSummary();
  const lastImport = state.storage?.repricerLastAuditImport || null;
  const lastFix = state.storage?.repricerLastAutoFix || null;
  const lastValidation = state.storage?.repricerLastImportValidation || null;
  const lastReconcile = state.storage?.repricerLastApiReconcile || null;
  const lastSnapshot = (state.storage?.repricerRepairSnapshots || [])[0] || null;
  const lastImportText = lastImport?.importedAt
    ? `Импорт: ${fmt.date(lastImport.importedAt)} · применено ${fmt.int(lastImport.applied)} · ошибок ${fmt.int(lastImport.errors)}`
    : 'Импортов пока не было';
  const lastFixText = lastFix?.appliedAt
    ? `Автопочин: ${fmt.date(lastFix.appliedAt)} · обработано ${fmt.int(lastFix.touched)}`
    : 'Автопочин еще не запускали';
  const validationText = lastValidation?.validatedAt
    ? (
      numberOrZero(lastValidation.awaitingRop) > 0
        ? `Excel прочитан: ${fmt.int(lastValidation.awaitingRop)} строк ждут РОП · рабочие правила ещё не изменены`
        : `Проверка Excel: ${fmt.date(lastValidation.validatedAt)} · ошибок ${fmt.int(lastValidation.errors)} · предупреждений ${fmt.int(lastValidation.warnings)}`
    )
    : 'Excel ещё не проверяли';
  const reconcileText = lastReconcile?.checkedAt
    ? `Сверка API: ${fmt.date(lastReconcile.checkedAt)} · принято ${fmt.int(lastReconcile.accepted)} · ждёт источника ${fmt.int(lastReconcile.waiting)} · ошибок ${fmt.int(lastReconcile.error)}`
    : 'API ещё не сверяли';
  return `
    <div class="repricer-operator-focus-card repricer-repair-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Очередь исправлений</h3>
          <p class="small muted">Что портал уже принял из аудита и что ждёт источники/API.</p>
        </div>
        ${api.active ? badge(`API в работе ${fmt.int(api.active)}`, 'warn') : badge('API очередь чистая', 'ok')}
      </div>
      <div class="badge-stack" style="margin-top:10px">
        ${badge(`добавить ${fmt.int(api.add)}`, api.add ? 'warn' : 'ok')}
        ${badge(`удалить ${fmt.int(api.remove)}`, api.remove ? 'warn' : 'ok')}
        ${badge(`себестоимость ${fmt.int(api.cost)}`, api.cost ? 'warn' : 'ok')}
        ${badge(`MIN/MAX ${fmt.int(api.minmax)}`, api.minmax ? 'warn' : 'ok')}
        ${badge(`цена из MP ${fmt.int(api.priceSnapshot)}`, api.priceSnapshot ? 'warn' : 'ok')}
        ${badge(`новые ${fmt.int(api.open)}`, api.open ? 'warn' : 'ok')}
        ${badge(`отправлено ${fmt.int(api.sent)}`, api.sent ? 'info' : 'ok')}
        ${badge(`принято ${fmt.int(api.accepted)}`, api.accepted ? 'ok' : 'info')}
        ${badge(`ошибка ${fmt.int(api.error)}`, api.error ? 'danger' : 'ok')}
      </div>
      <div class="repricer-repair-lines" style="margin-top:10px">
        <div><strong>${escapeHtml(lastImportText)}</strong></div>
        <div><strong>${escapeHtml(lastFixText)}</strong></div>
        <div><strong>${escapeHtml(validationText)}</strong></div>
        <div><strong>${escapeHtml(reconcileText)}</strong></div>
      </div>
      <div class="quick-actions" style="margin-top:12px">
        <button type="button" class="quick-chip" data-repricer-auto-fix>Починить безопасное</button>
        <button type="button" class="quick-chip" data-repricer-export="api:tasks" ${api.total ? '' : 'disabled aria-disabled="true"'}>Задачи API</button>
        <button type="button" class="quick-chip" data-repricer-api-mark-sent ${api.open ? '' : 'disabled aria-disabled="true"'}>API отправлено</button>
        <button type="button" class="quick-chip" data-repricer-api-reconcile ${api.total ? '' : 'disabled aria-disabled="true"'}>Сверить после API</button>
        <button type="button" class="quick-chip" data-repricer-undo-last ${lastSnapshot ? '' : 'disabled aria-disabled="true"'}>Отменить последнее</button>
      </div>
    </div>
  `;
}

function renderRepricerFixTeamCard(rows = buildRepricerRows()) {
  const counts = repricerFixTeamCounts(rows);
  const teams = ['prices', 'cost', 'api', 'marketplace', 'sku', 'manual'];
  const chips = teams.map((team) => {
    const count = counts[team] || 0;
    const tone = team === 'prices' || team === 'api' ? 'danger' : (count ? 'warn' : 'ok');
    return `<button type="button" class="quick-chip ${count ? tone : ''}" data-repricer-export="team:${escapeHtml(team)}" ${count ? '' : 'disabled aria-disabled="true"'}>${escapeHtml(repricerFixTeamLabel(team))} ${fmt.int(count)}</button>`;
  }).join('');
  return `
    <div class="repricer-operator-focus-card repricer-team-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Кто чинит</h3>
          <p class="small muted">Пачки по ответственному контуру: можно скачать только нужной команде.</p>
        </div>
        ${badge('файлы по командам', 'info')}
      </div>
      <div class="quick-actions" style="margin-top:12px">${chips}</div>
    </div>
  `;
}

function renderRepricerWorkLogicCard() {
  return `
    <div class="repricer-operator-focus-card repricer-logic-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Как работает решение</h3>
          <p class="small muted">Короткая схема без настроек: данные → проверка → предпросмотр → выгрузка/API → сверка.</p>
        </div>
        ${badge('минимум действий', 'ok')}
      </div>
      <div class="repricer-logic-steps" style="margin-top:12px">
        <div><strong>1. Данные</strong><span>Берём текущую цену, MIN/MAX, себестоимость, статус и live-ориентир.</span></div>
        <div><strong>2. Confidence</strong><span>Зелёные идут в шаблон, инфо и стоп остаются в аудите.</span></div>
        <div><strong>3. Исправления</strong><span>Excel сначала проверяется, автопочин показывает предпросмотр и сохраняет откат.</span></div>
        <div><strong>4. API</strong><span>Задачи получают статус: новая, отправлено, ждёт обновления источника или принято.</span></div>
      </div>
    </div>
  `;
}

function repricerLivePriceSnapshotStatus() {
  const payload = state.repricerLivePrices || state.repricer_live_prices || {};
  const summary = payload.summary || {};
  const generatedAt = String(payload.generatedAt || '').trim();
  const asOfDate = String(payload.asOfDate || '').trim();
  const generatedStamp = Date.parse(generatedAt);
  const ageHours = Number.isFinite(generatedStamp) ? Math.max(0, (Date.now() - generatedStamp) / 36e5) : null;
  const mappedRows = numberOrZero(summary.mappedRows);
  const unresolvedRows = numberOrZero(summary.unresolvedRows);
  const wbRows = numberOrZero(summary.platforms?.wb?.mappedRows);
  const ozonRows = numberOrZero(summary.platforms?.ozon?.mappedRows);
  const canonicalRows = Array.isArray(state.canonicalRepricer?.rows) ? state.canonicalRepricer.rows : [];
  const canonicalProtectedRows = canonicalRows.filter((row) => row?.policy?.margin_guard_required === true);
  const liveKeys = Object.fromEntries(['wb', 'ozon'].map((platform) => [
    platform,
    new Set((payload?.platforms?.[platform]?.rows || [])
      .map((row) => repricerNormalizeArticleKey(row?.articleKey || row?.article || ''))
      .filter(Boolean))
  ]));
  const protectedMissingRows = canonicalProtectedRows.length
    ? canonicalProtectedRows.filter((row) => !liveKeys[row.platform]?.has(repricerNormalizeArticleKey(row.article_key || row.articleKey || ''))).length
    : numberOrZero(summary.platforms?.wb?.protectedMissingRows)
      + numberOrZero(summary.platforms?.ozon?.protectedMissingRows);
  const liveSignals = state.repricerLiveSignals || state.repricer_live_signals || {};
  const directStockPlatforms = Array.isArray(liveSignals?.summary?.directPlatforms)
    ? liveSignals.summary.directPlatforms.map((value) => String(value || '').trim().toLowerCase())
    : [];
  const directStockReady = ['wb', 'ozon'].every((platform) => directStockPlatforms.includes(platform));
  const stockAsOf = ['wb', 'ozon']
    .map((platform) => String(liveSignals?.platforms?.[platform]?.stock?.asOfDate || '').trim())
    .filter(Boolean)
    .sort()
    .at(-1) || '';
  const status = String(payload.status || (mappedRows ? 'ok' : 'missing')).trim().toLowerCase();
  const fresh = status === 'ok' && ageHours !== null && ageHours <= 2;
  return {
    payload,
    summary,
    generatedAt,
    asOfDate,
    ageHours,
    mappedRows,
    unresolvedRows,
    protectedMissingRows,
    directStockPlatforms,
    directStockReady,
    stockAsOf,
    wbRows,
    ozonRows,
    status,
    fresh
  };
}

function renderRepricerLivePriceSyncCard() {
  const snapshot = repricerLivePriceSnapshotStatus();
  const cfg = typeof currentConfig === 'function' ? currentConfig() : (window.APP_CONFIG || {});
  const endpoint = String(
    cfg.repricerPriceSyncEndpoint
      || (cfg.supabase?.url ? `${String(cfg.supabase.url).replace(/\/+$/, '')}/functions/v1/repricer-price-sync` : '')
  ).trim();
  const tone = snapshot.fresh ? 'ok' : (snapshot.mappedRows ? 'warn' : 'danger');
  const headline = snapshot.fresh
    ? `Цены API свежие: ${fmt.int(snapshot.mappedRows)} строк`
    : (snapshot.mappedRows ? 'Снимок цен нужно обновить' : 'Нет актуального снимка цен API');
  const snapshotText = snapshot.generatedAt
    ? `${fmt.date(snapshot.generatedAt)} · дата цены ${snapshot.asOfDate || '—'}`
    : 'Серверный снимок ещё не опубликован';
  const blockingText = Array.isArray(snapshot.payload?.blockingReasons)
    ? snapshot.payload.blockingReasons.map((reason) => String(reason || '').trim()).filter(Boolean).join(' · ')
    : '';
  return `
    <div class="repricer-operator-focus-card repricer-live-price-sync-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Актуальные цены WB и Ozon</h3>
          <p class="small muted">Ключи хранятся на сервере. Портал обновляет цены, рекламные расходы и OOS, подставляет articleKey и заново считает реклама → маржа → MIN/MAX.</p>
        </div>
        ${badge(headline, tone)}
      </div>
      <div class="badge-stack" style="margin-top:10px">
        ${badge(`WB ${fmt.int(snapshot.wbRows)}`, snapshot.wbRows ? 'ok' : 'warn')}
        ${badge(`Ozon ${fmt.int(snapshot.ozonRows)}`, snapshot.ozonRows ? 'ok' : 'warn')}
        ${badge(`рабочих SKU не найдено ${fmt.int(snapshot.protectedMissingRows)}`, snapshot.protectedMissingRows ? 'warn' : 'ok')}
        ${badge(
          snapshot.directStockReady
            ? `OOS API WB/Ozon${snapshot.stockAsOf ? ` · ${snapshot.stockAsOf}` : ''}`
            : `OOS fallback${snapshot.stockAsOf ? ` · ${snapshot.stockAsOf}` : ''}`,
          snapshot.directStockReady ? 'ok' : 'warn'
        )}
        ${snapshot.unresolvedRows ? badge(`внешний каталог ${fmt.int(snapshot.unresolvedRows)}`, 'info') : ''}
        ${badge(snapshotText, snapshot.fresh ? 'ok' : 'warn')}
      </div>
      <button type="button" class="hidden" data-repricer-price-sync ${endpoint ? '' : 'disabled aria-disabled="true"'} aria-hidden="true" tabindex="-1">Получить актуальные цены</button>
      <div class="small muted" style="margin-top:12px" data-repricer-price-sync-status>${endpoint ? 'Одна кнопка в верхней панели обновляет цены, рекламу и OOS. После запуска страница сама подхватит новый снимок.' : 'Не настроен защищённый server endpoint для синхронизации цен.'}</div>
      ${blockingText ? `<div class="small muted repricer-price-sync-blocking" style="margin-top:6px">${escapeHtml(`Снимок заблокирован: ${blockingText}`)}</div>` : ''}
    </div>
  `;
}

function setRepricerPriceSyncStatus(root, message, tone = 'info') {
  const target = root?.querySelector?.('[data-repricer-price-sync-status]');
  if (!target) return;
  target.className = `small muted repricer-price-sync-status ${tone || 'info'}`;
  target.textContent = String(message || '');
}

function repricerPriceSyncAuthToken() {
  const cfg = typeof currentConfig === 'function' ? currentConfig() : (window.APP_CONFIG || {});
  const sessionToken = state.team?.accessToken
    || window.alteaPortalAuthGate?.getSession?.()?.access_token
    || window.__ALTEA_AUTH_SESSION__?.access_token
    || '';
  if (!sessionToken || sessionToken === cfg.supabase?.anonKey) return '';
  return sessionToken;
}

function applyRepricerPriceSnapshotBundle(snapshots = {}) {
  const livePrices = snapshots.repricer_live_prices;
  let applied = false;
  if (livePrices && typeof livePrices === 'object') {
    state.repricerLivePrices = livePrices;
    state.repricer_live_prices = livePrices;
    state.smartPriceWorkbenchLive = livePrices;
    applied = true;
  }
  if (snapshots.canonical_repricer) {
    state.canonicalRepricer = snapshots.canonical_repricer;
    applied = true;
  }
  if (snapshots.repricer_live_signals) {
    state.repricerLiveSignals = snapshots.repricer_live_signals;
    state.repricer_live_signals = snapshots.repricer_live_signals;
    applied = true;
  }
  if (snapshots.repricer_team_policy_proposals) {
    state.repricerTeamPolicyProposals = snapshots.repricer_team_policy_proposals;
    applied = true;
  }
  if (snapshots.repricer_shadow_report) {
    state.repricerShadowReport = snapshots.repricer_shadow_report;
    applied = true;
  }
  if (snapshots.repricer_price_apply_plan) {
    state.repricerPriceApplyPlan = snapshots.repricer_price_apply_plan;
    applied = true;
  }
  if (snapshots.repricer_price_apply_receipt) {
    state.repricerPriceApplyReceipt = snapshots.repricer_price_apply_receipt;
    applied = true;
  }
  if (snapshots.repricer_price_apply_verification) {
    state.repricerPriceApplyVerification = snapshots.repricer_price_apply_verification;
    applied = true;
  }
  if (snapshots.repricer) {
    state.repricer = snapshots.repricer;
    applied = true;
  }
  if (applied && typeof invalidateRepricerRowsCache === 'function') invalidateRepricerRowsCache();
  return applied;
}

function pollRepricerPriceSnapshot(root, baselineStamp, attempt = 0) {
  const maxAttempts = 30;
  const testPollDelay = Number(window.__ALTEA_REPRICER_PRICE_SYNC_TEST_POLL_MS__);
  const pollDelay = Number.isFinite(testPollDelay) && testPollDelay >= 0
    ? testPollDelay
    : (attempt === 0 ? 10000 : 15000);
  window.setTimeout(async () => {
    try {
      if (typeof resetPortalSnapshotState === 'function') resetPortalSnapshotState();
      const snapshots = typeof loadPortalSnapshotRows === 'function' ? await loadPortalSnapshotRows() : {};
      const nextStamp = Date.parse(snapshots?.repricer_live_prices?.generatedAt || '');
      if (Number.isFinite(nextStamp) && nextStamp > baselineStamp) {
        applyRepricerPriceSnapshotBundle(snapshots);
        delete root.dataset.repricerRenderSignature;
        renderRepricer();
        const nextRoot = document.getElementById('view-repricer') || root;
        setRepricerPriceSyncStatus(nextRoot, 'Готово: свежие цены подставлены, рекомендации пересчитаны.', 'ok');
        return;
      }
      if (attempt + 1 < maxAttempts) {
        setRepricerPriceSyncStatus(root, `Сервер собирает цены, рекламу и OOS, затем сопоставляет артикулы… проверка ${fmt.int(attempt + 1)}/${fmt.int(maxAttempts)}`, 'info');
        pollRepricerPriceSnapshot(root, baselineStamp, attempt + 1);
        return;
      }
      setRepricerPriceSyncStatus(root, 'Запуск принят, но новый снимок ещё не опубликован. Обновите раздел через несколько минут.', 'warn');
    } catch (error) {
      console.warn('[repricer.priceSync.poll]', error);
      if (attempt + 1 < maxAttempts) {
        pollRepricerPriceSnapshot(root, baselineStamp, attempt + 1);
      } else {
        setRepricerPriceSyncStatus(root, 'Не удалось прочитать результат синхронизации. Обновите страницу.', 'danger');
      }
    }
  }, pollDelay);
}

let repricerPriceSyncActionSequence = 0;

function currentRepricerPriceSyncButton(button) {
  if (!button) return null;
  if (button.hasAttribute?.('data-premium-primary-action')) {
    return document.querySelector('.altea-premium-app:not([hidden]) [data-premium-primary-action]') || (button.isConnected ? button : null);
  }
  return document.querySelector('#view-repricer [data-repricer-price-sync]') || (button.isConnected ? button : null);
}

async function requestRepricerPriceSync(button) {
  if (!button || button.dataset.repricerPriceSyncBusy === '1') return;
  const root = button.closest?.('#view-repricer') || document.getElementById('view-repricer');
  const cfg = typeof currentConfig === 'function' ? currentConfig() : (window.APP_CONFIG || {});
  const endpoint = String(
    cfg.repricerPriceSyncEndpoint
      || (cfg.supabase?.url ? `${String(cfg.supabase.url).replace(/\/+$/, '')}/functions/v1/repricer-price-sync` : '')
  ).trim();
  const token = repricerPriceSyncAuthToken();
  if (!endpoint) {
    setRepricerPriceSyncStatus(root, 'Не настроен защищённый server endpoint.', 'danger');
    return;
  }
  if (!token) {
    setRepricerPriceSyncStatus(root, 'Нужно войти в портал под рабочей учётной записью.', 'danger');
    return;
  }
  const originalText = button.textContent;
  const actionToken = String(++repricerPriceSyncActionSequence);
  button.dataset.repricerPriceSyncActionToken = actionToken;
  button.dataset.repricerPriceSyncBusy = '1';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Запускаю…';
  setRepricerPriceSyncStatus(root, 'Отправляю защищённый запрос на сервер…', 'info');
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: cfg.supabase?.anonKey || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source: 'portal-repricer',
        requestedAt: new Date().toISOString()
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      const failureMessage = response.status === 404
        ? 'Серверная функция синхронизации ещё не опубликована (HTTP 404).'
        : (payload?.detail || payload?.error || `HTTP ${response.status}`);
      throw new Error(failureMessage);
    }
    const baselineStamp = Date.parse((state.repricerLivePrices || {}).generatedAt || '') || 0;
    setRepricerPriceSyncStatus(root, 'Запуск принят. Собираю цены, рекламу и OOS WB/Ozon, сопоставляю артикулы и пересчитываю репрайсер…', 'ok');
    pollRepricerPriceSnapshot(root, baselineStamp);
  } catch (error) {
    console.error('[repricer.priceSync]', error);
    setRepricerPriceSyncStatus(root, `Не удалось запустить синхронизацию: ${error?.message || error}`, 'danger');
  } finally {
    window.setTimeout(() => {
      const currentButton = currentRepricerPriceSyncButton(button);
      if (!currentButton || currentButton.dataset.repricerPriceSyncActionToken !== actionToken) return;
      currentButton.disabled = false;
      currentButton.removeAttribute('aria-busy');
      delete currentButton.dataset.repricerPriceSyncBusy;
      delete currentButton.dataset.repricerPriceSyncActionToken;
      currentButton.textContent = originalText;
    }, 900);
  }
}

function renderRepricerPriceApplyCard() {
  const plan = state.repricerPriceApplyPlan || {};
  const receipt = state.repricerPriceApplyReceipt || {};
  const verification = state.repricerPriceApplyVerification || {};
  const cfg = typeof currentConfig === 'function' ? currentConfig() : (window.APP_CONFIG || {});
  const endpoint = String(
    cfg.repricerPriceApplyEndpoint
      || (cfg.supabase?.url ? `${String(cfg.supabase.url).replace(/\/+$/, '')}/functions/v1/repricer-price-apply` : '')
  ).trim();
  const actions = numberOrZero(plan?.summary?.actions);
  const applyAllowed = plan?.applyAllowed === true && plan?.status === 'ready' && actions > 0;
  const blockers = Array.isArray(plan?.globalBlockers) ? plan.globalBlockers : [];
  const verified = verification?.status === 'verified';
  const submitted = receipt?.status === 'submitted_pending_verification';
  const tone = verified ? 'ok' : (applyAllowed ? 'warn' : 'danger');
  const headline = verified
    ? `Проверено: ${fmt.int(verification?.summary?.matched || 0)} цен`
    : (applyAllowed ? `Готов план: ${fmt.int(actions)} цен` : 'Загрузка цен заблокирована');
  return `
    <div class="repricer-operator-focus-card repricer-price-apply-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Загрузка утверждённых цен</h3>
          <p class="small muted">Сначала сервер строит неизменяемый план. Отправка доступна только для ready-строк с прямыми остатками, свежей API-ценой и пройденными шлюзами.</p>
        </div>
        ${badge(headline, tone)}
      </div>
      <div class="badge-stack" style="margin-top:10px">
        ${badge(`WB ${fmt.int(plan?.summary?.wb || 0)}`, actions ? 'info' : 'warn')}
        ${badge(`Ozon ${fmt.int(plan?.summary?.ozon || 0)}`, actions ? 'info' : 'warn')}
        ${badge(`отклонено ${fmt.int(plan?.summary?.rejected || 0)}`, plan?.summary?.rejected ? 'warn' : 'ok')}
        ${submitted ? badge('отправлено, ждём сверку', 'warn') : ''}
        ${verified ? badge(`совпало ${fmt.int(verification?.summary?.matched || 0)}`, 'ok') : ''}
      </div>
      ${blockers.length ? `<div class="small muted" style="margin-top:8px">${escapeHtml(`Стоп: ${blockers.join(' · ')}`)}</div>` : ''}
      <div class="quick-actions" style="margin-top:12px">
        <button type="button" class="quick-chip" data-repricer-price-apply="plan" ${endpoint ? '' : 'disabled aria-disabled="true"'}>Сформировать план загрузки</button>
        <button type="button" class="quick-chip repricer-price-apply-primary" data-repricer-price-apply="apply" ${endpoint && applyAllowed ? '' : 'disabled aria-disabled="true"'}>Отправить ${fmt.int(actions)} утверждённых цен</button>
      </div>
      <div class="small muted" style="margin-top:8px" data-repricer-price-apply-status>${endpoint ? 'Отправка потребует отдельного подтверждения и после API автоматически сверит фактические цены.' : 'Не настроен защищённый server endpoint применения цен.'}</div>
    </div>
  `;
}

function setRepricerPriceApplyStatus(root, message, tone = 'info') {
  const target = root?.querySelector?.('[data-repricer-price-apply-status]');
  if (!target) return;
  target.className = `small muted repricer-price-apply-status ${tone || 'info'}`;
  target.textContent = String(message || '');
}

function releaseRepricerPriceApplyBusy(root) {
  root?.querySelectorAll?.('[data-repricer-price-apply][data-repricer-price-apply-busy="1"]').forEach((button) => {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    delete button.dataset.repricerPriceApplyBusy;
    button.textContent = button.dataset.repricerPriceApplyOriginalText || button.textContent;
    delete button.dataset.repricerPriceApplyOriginalText;
  });
}

function pollRepricerPriceApplySnapshot(root, mode, baselineStamp, attempt = 0, expected = {}) {
  const maxAttempts = 40;
  const testPollDelay = Number(window.__ALTEA_REPRICER_PRICE_APPLY_TEST_POLL_MS__);
  const pollDelay = Number.isFinite(testPollDelay) && testPollDelay >= 0 ? testPollDelay : (attempt === 0 ? 10000 : 15000);
  window.setTimeout(async () => {
    try {
      if (typeof resetPortalSnapshotState === 'function') resetPortalSnapshotState();
      const snapshots = typeof loadPortalSnapshotRows === 'function' ? await loadPortalSnapshotRows() : {};
      const target = mode === 'apply'
        ? snapshots?.repricer_price_apply_verification
        : snapshots?.repricer_price_apply_plan;
      const nextStamp = Date.parse(target?.generatedAt || '');
      const requestedByMatches = !expected.requestedBy
        || String(target?.requestedBy || '').trim().toLowerCase() === String(expected.requestedBy).trim().toLowerCase();
      const confirmationMatches = mode !== 'apply'
        || !expected.confirmationHash
        || String(target?.confirmationHash || '').trim() === String(expected.confirmationHash).trim();
      if (Number.isFinite(nextStamp) && nextStamp > baselineStamp && requestedByMatches && confirmationMatches) {
        applyRepricerPriceSnapshotBundle(snapshots);
        delete root.dataset.repricerRenderSignature;
        renderRepricer();
        const nextRoot = document.getElementById('view-repricer') || root;
        const succeeded = mode === 'apply'
          ? target?.status === 'verified'
          : target?.status === 'ready';
        setRepricerPriceApplyStatus(
          nextRoot,
          mode === 'apply'
            ? (succeeded ? 'Готово: цены изменены и совпали с повторной API-выгрузкой.' : 'Сверка завершилась с расхождениями. Повторная отправка заблокирована.')
            : (succeeded ? `План готов: ${fmt.int(target?.summary?.actions || 0)} цен. Проверьте и подтвердите отправку.` : 'План построен, но защитные шлюзы не позволяют отправку.'),
          succeeded ? 'ok' : 'danger'
        );
        return;
      }
      if (attempt + 1 < maxAttempts) {
        setRepricerPriceApplyStatus(root, `Сервер выполняет ${mode === 'apply' ? 'загрузку и сверку' : 'проверку плана'}… ${fmt.int(attempt + 1)}/${fmt.int(maxAttempts)}`, 'info');
        pollRepricerPriceApplySnapshot(root, mode, baselineStamp, attempt + 1, expected);
        return;
      }
      setRepricerPriceApplyStatus(root, 'Сервер не опубликовал результат в ожидаемое время. Проверьте workflow.', 'warn');
      releaseRepricerPriceApplyBusy(root);
    } catch (error) {
      console.warn('[repricer.priceApply.poll]', error);
      if (attempt + 1 < maxAttempts) {
        pollRepricerPriceApplySnapshot(root, mode, baselineStamp, attempt + 1, expected);
      } else {
        setRepricerPriceApplyStatus(root, 'Не удалось прочитать результат загрузки цен.', 'danger');
        releaseRepricerPriceApplyBusy(root);
      }
    }
  }, pollDelay);
}

async function requestRepricerPriceApply(button) {
  if (!button || button.dataset.repricerPriceApplyBusy === '1') return;
  const mode = String(button.getAttribute('data-repricer-price-apply') || 'plan').trim().toLowerCase();
  const root = button.closest?.('#view-repricer') || document.getElementById('view-repricer');
  const cfg = typeof currentConfig === 'function' ? currentConfig() : (window.APP_CONFIG || {});
  const endpoint = String(
    cfg.repricerPriceApplyEndpoint
      || (cfg.supabase?.url ? `${String(cfg.supabase.url).replace(/\/+$/, '')}/functions/v1/repricer-price-apply` : '')
  ).trim();
  const token = repricerPriceSyncAuthToken();
  const plan = state.repricerPriceApplyPlan || {};
  const confirmationHash = String(plan?.confirmationHash || '').trim();
  if (!endpoint) {
    setRepricerPriceApplyStatus(root, 'Не настроен защищённый server endpoint.', 'danger');
    return;
  }
  if (!token) {
    setRepricerPriceApplyStatus(root, 'Нужно войти в портал под рабочей учётной записью.', 'danger');
    return;
  }
  if (mode === 'apply') {
    if (!(plan?.applyAllowed === true && confirmationHash && numberOrZero(plan?.summary?.actions) > 0)) {
      setRepricerPriceApplyStatus(root, 'Текущий план не разрешён к отправке.', 'danger');
      return;
    }
    const confirmed = window.confirm(
      `Отправить ${fmt.int(plan.summary.actions)} утверждённых цен на WB/Ozon?\n\n`
      + 'После отправки сервер повторно выгрузит цены и потребует точного совпадения.'
    );
    if (!confirmed) return;
  }
  const baselineTarget = mode === 'apply' ? state.repricerPriceApplyVerification : state.repricerPriceApplyPlan;
  const baselineStamp = Date.parse(baselineTarget?.generatedAt || '') || 0;
  const originalText = button.textContent;
  let queued = false;
  button.dataset.repricerPriceApplyBusy = '1';
  button.dataset.repricerPriceApplyOriginalText = originalText;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = mode === 'apply' ? 'Отправляю…' : 'Строю план…';
  setRepricerPriceApplyStatus(root, 'Отправляю защищённый запрос на сервер…', 'info');
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: cfg.supabase?.anonKey || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        mode,
        confirmationHash: mode === 'apply' ? confirmationHash : ''
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      const failureMessage = response.status === 404
        ? 'Серверная функция применения цен ещё не опубликована (HTTP 404).'
        : (payload?.detail || payload?.error || `HTTP ${response.status}`);
      throw new Error(failureMessage);
    }
    setRepricerPriceApplyStatus(
      root,
      mode === 'apply' ? 'Запуск принят. Загружаю цены и жду повторную API-сверку…' : 'Запуск принят. Проверяю все шлюзы и строю план…',
      'ok'
    );
    queued = true;
    pollRepricerPriceApplySnapshot(root, mode, baselineStamp, 0, {
      requestedBy: String(payload?.requestedBy || '').trim(),
      confirmationHash: mode === 'apply' ? confirmationHash : ''
    });
  } catch (error) {
    console.error('[repricer.priceApply]', error);
    setRepricerPriceApplyStatus(root, `Не удалось запустить: ${error?.message || error}`, 'danger');
  } finally {
    if (!queued) releaseRepricerPriceApplyBusy(root);
  }
}

function repricerOperatorTaskPlan(health, stats = {}) {
  const metrics = health?.metrics || {};
  const tasks = [
    {
      title: 'Заполнить маржу SKU',
      count: metrics.missing_required_margin || 0,
      hint: 'Активные товары и новинки без собственной маржи не попадут в выгрузку.',
      mode: 'blocked',
      tone: 'danger',
      source: 'SKU / маржа'
    },
    {
      title: 'Проверить цены по приходу',
      count: stats.arrivalPriceCheckSides || 0,
      hint: 'Товар уже на площадке или отгружен, а цена требует проверки.',
      mode: 'arrival_price_check',
      tone: 'warn',
      source: 'WB/Ozon'
    },
    {
      title: 'Заполнить MIN',
      count: metrics.missing_effective_floor_actionable || 0,
      hint: 'Только строки, где MIN реально блокирует цену без отложенного статуса или fallback-защиты.',
      mode: 'blocked',
      tone: 'danger',
      source: 'Цены'
    },
    {
      title: 'Разобрать ниже MIN вручную',
      count: stats.belowMinSides || 0,
      hint: 'Текущая цена ниже порога, но автоматическое поднятие не прошло проверки.',
      mode: 'below_min',
      tone: 'danger',
      source: 'Цены'
    },
    {
      title: 'Дособрать себестоимость',
      count: metrics.missing_cost_actionable || 0,
      hint: 'Только строки без cost и без защитного proxy; fallback-экономика не блокирует выгрузку.',
      mode: 'blocked',
      tone: 'warn',
      source: 'Себестоимость'
    },
    {
      title: 'Подтянуть текущую цену',
      count: metrics.missing_current_price_actionable || 0,
      hint: 'Нет входной цены для активного контура.',
      mode: 'blocked',
      tone: 'warn',
      source: 'Маркетплейс'
    },
    {
      title: 'Сверить live-расхождения',
      count: stats.liveDriftSides || 0,
      hint: 'Наш финал расходится с текущим live repricer.',
      mode: 'live_drift',
      tone: 'warn',
      source: 'Ручное решение'
    },
    {
      title: 'Выгрузить советы',
      count: (stats.safeWbRows || 0) + (stats.safeOzonRows || 0),
      hint: 'Эти строки без красного стопа и готовы попасть в файл цен.',
      mode: 'changes',
      tone: 'ok',
      source: 'Выгрузка'
    }
  ];
  const active = tasks.filter((task) => numberOrZero(task.count) > 0);
  return active.length ? active : [{
    title: 'Контур чистый',
    count: metrics.sku_count || 0,
    hint: 'Критичных стопов сейчас нет.',
    mode: 'changes',
    tone: 'ok',
    source: 'Выгрузка'
  }];
}

function repricerIssueBatchCounts(rows) {
  const counts = { missing_margin: 0, missing_min: 0, missing_cost: 0, below_min: 0, live_drift: 0 };
  repricerCollectSides(rows).forEach(({ side }) => {
    if (!side) return;
    const batch = repricerIssueBatch(side);
    if (Object.prototype.hasOwnProperty.call(counts, batch)) counts[batch] += 1;
  });
  return counts;
}

function repricerOperatorQueueRows(rows, limit = 6) {
  const scored = repricerCollectSides(rows).filter(({ side }) => side && !side.outOfSpec && (side.confidence !== 'green' || side.arrivalPriceSignal?.needsCheck))
    .map(({ row, side }) => {
      const flags = repricerIssueFlags(side);
      const score = (flags.missingMargin ? 150 : 0)
        + (flags.missingMin ? 120 : 0)
        + (flags.belowMin ? 90 : 0)
        + (side.criticalGate === 'BLOCK' ? 70 : 0)
        + (side.marginRisk ? 55 : 0)
        + (flags.missingPrice ? 45 : 0)
        + (flags.missingCost ? 35 : 0)
        + (side.arrivalPriceSignal?.needsCheck ? 65 : 0)
        + (side.liveDrift ? 18 : 0)
        + numberOrZero(side.confidenceScore);
      return { row, side, score };
    })
    .sort((left, right) => right.score - left.score || String(left.row?.article || left.row?.articleKey || '').localeCompare(String(right.row?.article || right.row?.articleKey || ''), 'ru'));
  return scored.slice(0, limit);
}

function setRepricerExportStatus(root, message, tone = 'info') {
  const target = root?.querySelector?.('[data-repricer-export-status]');
  if (!target) return;
  target.className = `small muted repricer-export-status ${tone || 'info'}`;
  target.textContent = message || '';
}

function runRepricerExport(button, task) {
  if (!button || button.dataset.repricerExportBusy === '1') return;
  const root = button.closest?.('#view-repricer') || document.getElementById('view-repricer');
  const originalText = button.textContent;
  const wasDisabled = button.disabled;
  button.dataset.repricerExportBusy = '1';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Готовлю...';
  setRepricerExportStatus(root, 'Готовлю файл...', 'info');
  try {
    const result = task();
    if (result?.message) {
      setRepricerExportStatus(root, result.message, result.tone || (result.ok ? 'ok' : 'warn'));
      button.textContent = result.ok === false ? 'Скачан аудит' : 'Скачано';
    } else {
      setRepricerExportStatus(root, 'Файл подготовлен.', 'ok');
      button.textContent = 'Скачано';
    }
  } catch (error) {
    console.error('[repricer] export failed', error);
    setRepricerExportStatus(root, 'Не удалось подготовить Excel. Обновите страницу и попробуйте ещё раз.', 'danger');
    button.textContent = 'Ошибка';
  } finally {
    window.setTimeout(() => {
      button.disabled = wasDisabled;
      button.removeAttribute('aria-busy');
      delete button.dataset.repricerExportBusy;
      button.textContent = originalText;
    }, 700);
  }
}

function runRepricerExportMode(button, mode) {
  runRepricerExport(button, () => {
    const rows = buildRepricerRows();
    if (mode === 'margin:sku') {
      return downloadRepricerSkuMarginExcel(rows);
    }
    if (mode === 'template:wb') {
      return downloadRepricerTemplateExcel('wb', rows, repricerTemplateStats(rows, 'wb'));
    }
    if (mode === 'template:ozon') {
      return downloadRepricerTemplateExcel('ozon', rows, repricerTemplateStats(rows, 'ozon'));
    }
    if (mode === 'promo:wb') {
      return downloadRepricerPromoTemplateExcel('wb', rows);
    }
    if (mode === 'promo:ozon') {
      return downloadRepricerPromoTemplateExcel('ozon', rows);
    }
    if (mode === 'stop:all') {
      return downloadRepricerStopList('all', rows);
    }
    if (mode.startsWith('batch:')) {
      return downloadRepricerStopList(mode.replace('batch:', ''), rows);
    }
    if (mode === 'fix:proposals') {
      return downloadRepricerFixProposals(rows);
    }
    if (mode === 'api:tasks') {
      return downloadRepricerApiTasks();
    }
    if (mode.startsWith('team:')) {
      return downloadRepricerTeamIssues(mode.replace('team:', ''), rows);
    }
    return downloadRepricerExcel(mode, rows);
  });
}

function repricerProductLifecycleEditorHtml(row = {}) {
  const articleKey = String(row.articleKey || row.article || row.sku || '').trim();
  if (!articleKey) return '';
  const lifecycle = row.productLifecycle || repricerProductLifecycleForRecord(row, row.status || '', articleKey);
  return `
    <div class="repricer-product-lifecycle-form" data-article-key="${escapeHtml(articleKey)}" style="grid-column:1 / -1;margin:10px 0 4px">
      <div class="muted small">Статус товара: <strong>${escapeHtml(lifecycle?.label || lifecycle?.status || row.status || '—')}</strong>. Изменение создаётся в SKU Workspace и применяется только после подтверждения РОПа.</div>
      <div class="quick-actions">
        <button type="button" class="quick-chip" data-repricer-open-sku-workspace data-article-key="${escapeHtml(articleKey)}">Открыть SKU Workspace</button>
      </div>
    </div>
  `;
}

function attachRepricerEvents(root) {
  root.querySelector('[data-repricer-price-sync]')?.addEventListener('click', async (event) => {
    await requestRepricerPriceSync(event.currentTarget);
  });
  root.querySelectorAll('[data-repricer-price-apply]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      await requestRepricerPriceApply(event.currentTarget);
    });
  });
  root.querySelectorAll('[data-repricer-layer-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      setRepricerOperatorLayer(button.getAttribute('data-repricer-layer-toggle') || 'simple');
    });
  });
  root.querySelectorAll('[data-repricer-open-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.getAttribute('data-repricer-open-filter') || 'changes';
      state.repricerFilters.mode = mode;
      setRepricerOperatorLayer('advanced');
    });
  });
  const auditImportInput = root.querySelector('[data-repricer-audit-import]');
  root.querySelectorAll('[data-repricer-import="audit"]').forEach((button) => {
    button.addEventListener('click', () => {
      const importKind = button.getAttribute('data-repricer-import-kind') || 'audit';
      setRepricerExportStatus(
        root,
        importKind === 'margin'
          ? 'Выберите файл «Маржа SKU Excel», в котором заполнена колонка «Новая маржа SKU, %».'
          : 'Выберите рабочий Excel, который скачали из репрайсера и заполнили.',
        'info'
      );
      auditImportInput?.click();
    });
  });
  root.querySelectorAll('[data-repricer-auto-fix]').forEach((button) => {
    button.addEventListener('click', () => {
      applyRepricerSafeFixes();
    });
  });
  root.querySelector('[data-repricer-undo-last]')?.addEventListener('click', () => {
    restoreLastRepricerRepairSnapshot();
  });
  root.querySelector('[data-repricer-api-mark-sent]')?.addEventListener('click', () => {
    markRepricerApiTasksSent();
  });
  root.querySelector('[data-repricer-api-reconcile]')?.addEventListener('click', () => {
    reconcileRepricerApiTasks();
  });
  auditImportInput?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    importRepricerAuditFile(file)
      .catch((error) => {
        console.error('[repricer.importAudit]', error);
        window.alert(`Не удалось импортировать решения: ${error?.message || error}`);
      })
      .finally(() => {
        event.target.value = '';
      });
  });
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
  root.querySelector('#repricerListSizeFilter')?.addEventListener('change', (event) => {
    state.repricerFilters.listSize = event.target.value;
    renderRepricer();
  });
  root.querySelectorAll('[data-repricer-quick-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.repricerFilters.mode = button.getAttribute('data-repricer-quick-mode') || 'changes';
      renderRepricer();
    });
  });
  root.querySelectorAll('[data-repricer-list-size]').forEach((button) => {
    button.addEventListener('click', () => {
      state.repricerFilters.listSize = button.getAttribute('data-repricer-list-size') || 'focus';
      renderRepricer();
    });
  });
  root.querySelector('#repricerSettingsForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    saveRepricerSettings(event.currentTarget);
  });
  root.querySelector('#repricerSettingsForm')?.addEventListener('change', (event) => {
    saveRepricerSettings(event.currentTarget);
  });
  root.querySelector('[data-repricer-settings-reset]')?.addEventListener('click', () => {
    state.storage.repricerSettings = defaultRepricerSettings();
    state.storage.repricerSettingsUpdatedAt = new Date().toISOString();
    persistRepricerState();
  });
  root.querySelectorAll('[data-repricer-section]').forEach((details) => {
    details.addEventListener('toggle', () => {
      const sectionKey = details.getAttribute('data-repricer-section') || '';
      const needsLazyRender = sectionKey === 'settingsCardV2' && details.open && !root.querySelector('#repricerSettingsForm');
      repricerSetUiToggleOpen('sections', sectionKey, details.open);
      if (needsLazyRender) setTimeout(renderRepricer, 0);
    });
  });
  root.querySelectorAll('[data-repricer-history]').forEach((details) => {
    details.addEventListener('toggle', () => {
      repricerSetUiToggleOpen('history', details.getAttribute('data-repricer-history') || '', details.open);
    });
  });
  root.querySelectorAll('[data-repricer-controls]').forEach((details) => {
    details.addEventListener('toggle', () => {
      const controlsKey = details.getAttribute('data-repricer-controls') || '';
      const needsLazyRender = details.open && !details.querySelector('.repricer-corridor-form');
      repricerSetUiToggleOpen('controls', controlsKey, details.open);
      if (needsLazyRender) setTimeout(renderRepricer, 0);
    });
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
  root.querySelectorAll('[data-repricer-open-sku-workspace]').forEach((button) => {
    button.addEventListener('click', () => {
      state.filters = state.filters || {};
      state.filters.search = button.getAttribute('data-article-key') || '';
      if (typeof setView === 'function') setView('sku-contour');
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
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveRepricerOverride(event.currentTarget);
    });
  });
  root.querySelectorAll('[data-repricer-reset]').forEach((button) => {
    button.addEventListener('click', () => {
      resetRepricerOverride(button.getAttribute('data-article-key') || '', button.getAttribute('data-platform') || 'all');
    });
  });
  root.querySelectorAll('[data-repricer-adopt-offer]').forEach((button) => {
    button.addEventListener('click', async () => {
      await applyRepricerPromoOffer(button.getAttribute('data-article-key') || '', button.getAttribute('data-platform') || 'wb');
    });
  });
  if (root.dataset.repricerExportDelegate !== '20260516direct') {
    root.dataset.repricerExportDelegate = '20260516direct';
    root.addEventListener('click', (event) => {
      const button = event.target?.closest?.('[data-repricer-export]');
      if (!button || !root.contains(button)) return;
      event.preventDefault();
      event.stopPropagation();
      const mode = button.getAttribute('data-repricer-export') || 'all';
      runRepricerExportMode(button, mode);
    });
  }
}

function repricerRuntimeStatusBadges() {
  const readiness = state.portalFeatureReadiness?.features?.repricer || {};
  const runtime = state.portalRuntimeWiring || {};
  const canonical = state.canonicalRepricer || {};
  const canonicalRows = Array.isArray(canonical.rows) ? canonical.rows.length : 0;
  const shadow = state.repricerShadowReport || {};
  const shadowSummary = shadow.summary || {};
  const gaps = state.repricerMarginMinMaxGaps || {};
  const gapRows = Number(gaps?.summary?.blockedRows);
  const shadowPresent = shadow.schema === 'repricer-shadow-report-v1';
  const badges = [];
  if (shadowPresent) {
    const cutoverAllowed = shadow.cutover_allowed === true;
    const canonicalVisible = canonicalRepricerRowsAvailable();
    badges.push(badge(
      cutoverAllowed
        ? 'CANONICAL ACTIVE'
        : (canonicalVisible ? 'CANONICAL AUDIT' : 'LEGACY FALLBACK'),
      cutoverAllowed ? 'ok' : 'warn'
    ));
    const readyRows = shadowSummary.canonical_ready_rows ?? canonical?.summary?.publishable_rows ?? 0;
    badges.push(badge(`canonical ${fmt.int(readyRows)}/${fmt.int(canonicalRows)}`, 'info'));
    if (Number.isFinite(gapRows)) {
      badges.push(badge(
        gapRows > 0 ? `маржа/MIN/MAX: ${fmt.int(gapRows)} стоп` : 'маржа/MIN/MAX: заполнено',
        gapRows > 0 ? 'danger' : 'ok'
      ));
    }
    const comparableRows = Number(shadowSummary.comparable_ready_rows) || 0;
    const agreement = Number(shadowSummary.price_agreement);
    if (comparableRows > 0 && Number.isFinite(agreement)) {
      const threshold = Number(shadow?.thresholds?.min_price_agreement);
      const parityOk = Number.isFinite(threshold) ? agreement >= threshold : agreement >= 0.95;
      badges.push(badge(`паритет цен ${fmt.pct(agreement)}`, parityOk ? 'ok' : 'warn'));
    }
  } else if (canonicalRows) {
    badges.push(badge(`canonical ${fmt.int(canonicalRows)} · shadow нет`, 'warn'));
  }
  const status = String(
    shadowPresent
      ? (canonical?.summary?.feature_status || canonical?.feature_status || '')
      : (readiness.status || canonical?.feature_status || '')
  ).trim().toLowerCase();
  if (status) {
    const tone = status === 'ok' ? 'ok' : (status === 'blocked' ? 'danger' : 'warn');
    const publishable = shadowPresent
      ? canonical?.summary?.publishable_rows
      : (readiness.publishable_rows ?? canonical?.summary?.publishable_rows);
    const eligible = shadowPresent
      ? canonical?.summary?.eligible_rows
      : (readiness.eligible_rows ?? canonical?.summary?.eligible_rows);
    const suffix = eligible != null ? ` ${fmt.int(publishable || 0)}/${fmt.int(eligible)}` : '';
    badges.push(badge(`repricer ${status}${suffix}`, tone));
  }
  if (runtime.status && runtime.status !== 'ok') {
    badges.push(badge(`runtime ${runtime.status}`, runtime.status === 'blocked' ? 'danger' : 'warn'));
  }
  return badges;
}

function renderRepricer() {
  const root = document.getElementById('view-repricer');
  if (!root) return;
  const operatorLayer = repricerOperatorLayer();
  const renderSignature = repricerRenderSignature(operatorLayer);
  if (root.dataset.repricerRenderSignature === renderSignature && root.children.length) return;
  const sourceRows = buildRepricerRows();
  if (!sourceRows.length) {
    root.dataset.repricerDataSource = 'missing';
    root.dataset.repricerRenderSignature = renderSignature;
    root.innerHTML = `<div class="card"><div class="head"><div><h3>Репрайсер</h3><div class="muted small">Контур пока не получил smart price workbench.</div></div>${badge('нет данных', 'warn')}</div><div class="muted" style="margin-top:10px">Нужно дождаться загрузки снапшота цен, после этого вкладка начнет считать рекомендации и хранить override прямо в портале.</div></div>`;
    return;
  }
  const canonicalDisplay = sourceRows.some((row) => row?.canonicalSource === true);
  root.dataset.repricerDataSource = canonicalDisplay
    ? (canonicalRepricerCutoverAllowed() ? 'canonical-active' : 'canonical-audit')
    : 'legacy-fallback';
  const operatorSimple = operatorLayer !== 'advanced';
  scheduleRepricerAutomaticSharpPriceApprovals(sourceRows);
  const health = repricerHealthcheck(sourceRows);
  const livePriceSyncCard = renderRepricerLivePriceSyncCard();
  const priceApplyCard = renderRepricerPriceApplyCard();
  const smokeTests = health.smokeTests;
  const sideRows = sourceRows.flatMap((row) => [row.wb, row.ozon].filter(Boolean));
  const arrivalSignalStats = repricerArrivalSignalStats(sourceRows);
  const arrivalSignalCard = renderRepricerArrivalPriceSignalCard(sourceRows);
  const feeStackSides = sideRows.filter((side) => side.economicFloorSource === 'fee_stack').length;
  const mixedGuardSides = sideRows.filter((side) => side.economicFloorSource === 'snapshot_guard').length;
  const fallbackSides = sideRows.filter((side) => side.economicFloorSource === 'snapshot_fallback').length;
  const missingCostActionable = numberOrZero(health.metrics?.missing_cost_actionable);
  const missingFloorActionable = numberOrZero(health.metrics?.missing_effective_floor_actionable);
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
  const actionableRows = sourceRows.filter((row) => row.changed).length;
  const manualOverrideRows = sourceRows.filter((row) => row.hasManualOverride).length;
  const belowMinSides = sideRows.filter((side) => repricerBelowMinNeedsManual(side)).length;
  const floorRaiseReadySides = sideRows.filter((side) => side.floorRaiseReady).length;
  const floorRaiseSafeSides = sideRows.filter((side) => side.floorRaiseSafeToExport).length;
  const confidenceGreenSides = sideRows.filter((side) => side.confidence === 'green').length;
  const confidenceYellowSides = sideRows.filter((side) => side.confidence === 'yellow').length;
  const confidenceRedSides = sideRows.filter((side) => side.confidence === 'red').length;
  const safeWbRegularRows = repricerCollectSides(sourceRows, 'wb').filter(({ side }) => side.safeToExport).length;
  const safeOzonRegularRows = repricerCollectSides(sourceRows, 'ozon').filter(({ side }) => side.safeToExport).length;
  const safePromoWbRows = repricerCollectSides(sourceRows, 'wb').filter(({ side }) => side.promoSafeToExport).length;
  const safePromoOzonRows = repricerCollectSides(sourceRows, 'ozon').filter(({ side }) => side.promoSafeToExport).length;
  const safeWbRows = safeWbRegularRows + safePromoWbRows;
  const safeOzonRows = safeOzonRegularRows + safePromoOzonRows;
  const templateStats = {
    wb: repricerTemplateStats(sourceRows, 'wb'),
    ozon: repricerTemplateStats(sourceRows, 'ozon')
  };
  const smokePassed = health.metrics.smoke_passed;
  const summaryBadges = [
    ...repricerRuntimeStatusBadges(),
    badge(`нужны решения ${fmt.int(actionableRows)}`, actionableRows ? 'warn' : 'ok'),
    badge(`ручные решения ${fmt.int(manualOverrideRows)}`, manualOverrideRows ? 'info' : 'ok'),
    badge(`поднять до MIN ${fmt.int(floorRaiseSafeSides)}`, floorRaiseSafeSides ? 'ok' : 'info'),
    badge(`ниже MIN вручную ${fmt.int(belowMinSides)}`, belowMinSides ? 'danger' : 'ok'),
    badge(`пришёл → цена ${fmt.int(arrivalSignalStats.total.check)}`, arrivalSignalStats.total.check ? 'warn' : 'ok'),
    badge(`нет входов ${fmt.int(blockedGateSides)}`, blockedGateSides ? 'danger' : 'ok'),
    badge(`нет себеса к решению ${fmt.int(missingCostActionable)}`, missingCostActionable ? 'danger' : 'ok'),
    badge(`нет MIN к решению ${fmt.int(missingFloorActionable)}`, missingFloorActionable ? 'danger' : 'ok'),
    badge(`расходятся с live ${fmt.int(liveDriftSides)}`, liveDriftSides ? 'warn' : 'ok')
  ].join('');
  const techBadges = [
    badge(`полная экономика ${fmt.int(feeStackSides)}`, feeStackSides ? 'ok' : 'warn'),
    badge(`защита snapshot ${fmt.int(mixedGuardSides)}`, mixedGuardSides ? 'info' : ''),
    badge(`fallback экономика ${fmt.int(fallbackSides)}`, fallbackSides ? 'info' : 'ok'),
    badge(`промо активно ${fmt.int(promoSides)}`, promoSides ? 'warn' : 'info'),
    badge(`предложения акций ${fmt.int(promoOfferSides)}`, promoOfferSides ? 'info' : ''),
    badge(`акция ведёт цену ${fmt.int(promoOfferActiveSides)}`, promoOfferActiveSides ? 'ok' : ''),
    badge(`план промо ${fmt.int(promoScheduledSides)}`, promoScheduledSides ? 'info' : ''),
    badge(`промо истекло ${fmt.int(promoExpiredSides)}`, promoExpiredSides ? 'warn' : ''),
    badge(`приход/отгрузка ${fmt.int(arrivalSignalStats.total.movement)}`, arrivalSignalStats.total.movement ? 'info' : ''),
    badge(`пришёл → цена ${fmt.int(arrivalSignalStats.total.check)}`, arrivalSignalStats.total.check ? 'warn' : 'ok'),
    badge(`выравнивание ${fmt.int(alignmentChangedRows)}`, alignmentChangedRows ? 'ok' : 'info'),
    badge(`тесты ${fmt.int(smokePassed)}/${fmt.int(smokeTests.length)}`, smokePassed === smokeTests.length ? 'ok' : 'warn'),
    badge(`есть live-ориентир ${fmt.int(liveBenchmarkSides)}`, liveBenchmarkSides ? 'info' : 'warn'),
    badge(`расходятся с live ${fmt.int(liveDriftSides)}`, liveDriftSides ? 'warn' : 'ok')
  ].join('');
  const safetyBadges = [
    badge(`зелёные ${fmt.int(confidenceGreenSides)}`, confidenceGreenSides ? 'ok' : 'warn'),
    badge(`аудит ${fmt.int(confidenceYellowSides)}`, confidenceYellowSides ? 'info' : 'ok'),
    badge(`стоп ${fmt.int(confidenceRedSides)}`, confidenceRedSides ? 'danger' : 'ok'),
    badge(`в файлы WB ${fmt.int(safeWbRows)}`, safeWbRows ? 'ok' : 'warn'),
    badge(`в файлы Ozon ${fmt.int(safeOzonRows)}`, safeOzonRows ? 'ok' : 'warn'),
    badge(`обычные ${fmt.int(safeWbRegularRows + safeOzonRegularRows)}`, safeWbRegularRows + safeOzonRegularRows ? 'ok' : 'info'),
    badge(`промо ${fmt.int(safePromoWbRows + safePromoOzonRows)}`, safePromoWbRows + safePromoOzonRows ? 'info' : '')
  ].join('');
  const stopReasonBadges = (health.stopReasons || []).slice(0, 7)
    .map((item) => badge(`${item.label} ${fmt.int(item.count)}`, item.label === 'нет входов' || item.label === 'нет цены' || item.label === 'нет MIN' ? 'danger' : 'warn'))
    .join('');
  const safetyCard = `
    <div class="card repricer-safety-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Безопасная выгрузка</h3>
          <p class="small muted">В шаблоны WB/Ozon попадают строки с изменением цены без красного стопа. Инфо-аудит остается видимым, но не режет объем советов.</p>
        </div>
        <div class="badge-stack">${safeWbRows || safeOzonRows ? badge('советы готовы', 'ok') : badge('нет изменений без стопа', 'warn')}</div>
      </div>
      <div class="badge-stack" style="margin-top:10px">${safetyBadges}</div>
      <div class="badge-stack" style="margin-top:10px">${stopReasonBadges || badge('стоп-лист пуст', 'ok')}</div>
    </div>
  `;
  const templateExplainCard = `
    <div class="repricer-operator-focus-card repricer-template-explain-card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Почему шаблон такой</h3>
          <p class="small muted">Шаблон цен получает строки без красного стопа, где финальная цена отличается от текущей.</p>
        </div>
        ${safeWbRows || safeOzonRows ? badge('есть что выгружать', 'ok') : badge('шаблон пуст', 'warn')}
      </div>
      <div class="repricer-template-explain-grid" style="margin-top:12px">
        <div class="repricer-operator-sku">
          <div>
            <strong>WB: ${fmt.int(templateStats.wb.safe)} в файлы</strong>
            <span>${escapeHtml(repricerTemplateEmptyReason(templateStats.wb))}</span>
          </div>
          <div class="badge-stack">${badge(`обычные ${fmt.int(templateStats.wb.regularSafe)}`, templateStats.wb.regularSafe ? 'ok' : 'info')}${badge(`промо ${fmt.int(templateStats.wb.promoSafe)}`, templateStats.wb.promoSafe ? 'info' : '')}${badge(`зелёные ${fmt.int(templateStats.wb.green)}`, templateStats.wb.green ? 'ok' : 'warn')}${badge(`до MIN ${fmt.int(templateStats.wb.floorRaiseSafe)}`, templateStats.wb.floorRaiseSafe ? 'ok' : 'info')}${badge(`без изменения ${fmt.int(templateStats.wb.greenNoChange)}`, templateStats.wb.greenNoChange ? 'info' : '')}${badge(`аудит ${fmt.int(templateStats.wb.yellow)}`, templateStats.wb.yellow ? 'info' : 'ok')}${badge(`стоп ${fmt.int(templateStats.wb.red)}`, templateStats.wb.red ? 'danger' : 'ok')}</div>
        </div>
        <div class="repricer-operator-sku">
          <div>
            <strong>Ozon: ${fmt.int(templateStats.ozon.safe)} в файлы</strong>
            <span>${escapeHtml(repricerTemplateEmptyReason(templateStats.ozon))}</span>
          </div>
          <div class="badge-stack">${badge(`обычные ${fmt.int(templateStats.ozon.regularSafe)}`, templateStats.ozon.regularSafe ? 'ok' : 'info')}${badge(`промо ${fmt.int(templateStats.ozon.promoSafe)}`, templateStats.ozon.promoSafe ? 'info' : '')}${badge(`зелёные ${fmt.int(templateStats.ozon.green)}`, templateStats.ozon.green ? 'ok' : 'warn')}${badge(`до MIN ${fmt.int(templateStats.ozon.floorRaiseSafe)}`, templateStats.ozon.floorRaiseSafe ? 'ok' : 'info')}${badge(`без изменения ${fmt.int(templateStats.ozon.greenNoChange)}`, templateStats.ozon.greenNoChange ? 'info' : '')}${badge(`аудит ${fmt.int(templateStats.ozon.yellow)}`, templateStats.ozon.yellow ? 'info' : 'ok')}${badge(`стоп ${fmt.int(templateStats.ozon.red)}`, templateStats.ozon.red ? 'danger' : 'ok')}</div>
        </div>
      </div>
    </div>
  `;

  if (operatorSimple) {
    const batchCounts = repricerIssueBatchCounts(sourceRows);
    const batchButtons = [
      ['missing_margin', 'нет маржи SKU', batchCounts.missing_margin, 'danger'],
      ['missing_min', 'нет MIN', batchCounts.missing_min, 'danger'],
      ['missing_cost', 'нет себестоимости', batchCounts.missing_cost, 'warn'],
      ['below_min', 'ниже MIN вручную', batchCounts.below_min, 'danger'],
      ['live_drift', 'live расходится', batchCounts.live_drift, 'warn']
    ].map(([key, label, count, tone]) => `
      <button type="button" class="quick-chip ${count ? tone : ''}" data-repricer-export="batch:${escapeHtml(key)}">${escapeHtml(label)} ${fmt.int(count)}</button>
    `).join('');
    const taskPlan = repricerOperatorTaskPlan(health, { belowMinSides, liveDriftSides, safeWbRows, safeOzonRows, arrivalPriceCheckSides: arrivalSignalStats.total.check });
    const taskCards = taskPlan.slice(0, 4).map((task, index) => `
      <div class="repricer-operator-task ${escapeHtml(task.tone)}">
        <div class="repricer-operator-task-index">${fmt.int(index + 1)}</div>
        <div>
          <strong>${escapeHtml(task.title)}</strong>
          <span>${escapeHtml(task.hint)}</span>
          <em>${escapeHtml(task.source || 'Аудит')}</em>
        </div>
        <button type="button" class="quick-chip" data-repricer-open-filter="${escapeHtml(task.mode)}">${fmt.int(task.count)}</button>
      </div>
    `).join('');
    const queueRows = repricerOperatorQueueRows(sourceRows, 6);
    const queueMarkup = queueRows.map(({ row, side }) => {
      const reason = repricerPrimaryStopReason(side) || side.reasonCode || 'проверить';
      const platformLabel = side.platform === 'ozon' ? 'Ozon' : 'WB';
      return `
        <div class="repricer-operator-sku">
          <div>
            <strong>${linkToSku(row.articleKey, row.article || row.articleKey)} · ${escapeHtml(platformLabel)}</strong>
            <span>${escapeHtml(row.name || row.owner || side.decisionText || 'Без названия')}</span>
            <span>${escapeHtml(repricerFixSource(side))}: ${escapeHtml(repricerFixAction(side))}</span>
          </div>
          ${badge(reason, side.confidence === 'red' ? 'danger' : 'warn')}
        </div>
      `;
    }).join('');
    const issueItems = (health.stopReasons || []).slice(0, 5)
      .map((item) => `<div class="repricer-operator-issue"><strong>${escapeHtml(item.label)}</strong><span>${fmt.int(item.count)}</span></div>`)
      .join('');
    const wbTemplate = templateStats.wb || {};
    const ozonTemplate = templateStats.ozon || {};
    const safeCount = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const wbCheckCount = safeCount(wbTemplate.yellow) + safeCount(wbTemplate.red);
    const ozonCheckCount = safeCount(ozonTemplate.yellow) + safeCount(ozonTemplate.red);
    const emptyExportReasons = [
      ['нет маржи SKU', safeCount(wbTemplate.missingMargin) + safeCount(ozonTemplate.missingMargin), 'Заполнить утверждённую маржу через аудит'],
      ['нет MIN', safeCount(wbTemplate.missingMin) + safeCount(ozonTemplate.missingMin), 'Заполнить MIN/MAX в Ценах или через аудит'],
      ['ниже MIN вручную', safeCount(wbTemplate.belowMin) + safeCount(ozonTemplate.belowMin), 'Проверить цену и рабочий порог'],
      ['нет себестоимости', safeCount(wbTemplate.missingCost) + safeCount(ozonTemplate.missingCost), 'Добавить себестоимость или fee-контур'],
      ['аудит', wbCheckCount + ozonCheckCount, 'Держим видимым, но инфо-аудит не режет объем советов'],
      ['стоп входов', safeCount(wbTemplate.blocked) + safeCount(ozonTemplate.blocked), 'Разобрать блокирующие входы SKU']
    ].filter(([, count]) => count > 0).slice(0, 4);
    const emptyExportReasonMarkup = emptyExportReasons.map(([label, count, hint]) => `
      <div class="repricer-empty-reason">
        <strong>${escapeHtml(label)}</strong>
        <span>${fmt.int(count)}</span>
        <em>${escapeHtml(hint)}</em>
      </div>
    `).join('');
    const noSafeExport = safeWbRows + safeOzonRows <= 0;
    const lastImportValidation = state.storage?.repricerLastImportValidation || null;
    const awaitingRopFromImport = numberOrZero(lastImportValidation?.awaitingRop);
    const readiness = repricerGameReadinessModel(health, templateStats, {
      safeWbRows,
      safeOzonRows,
      safeWbRegularRows,
      safeOzonRegularRows,
      safePromoWbRows,
      safePromoOzonRows,
      wbCheckCount,
      ozonCheckCount,
      belowMinSides,
      liveDriftSides,
      fallbackSides
    });
    const repricerMarketplaceHtml = `
      <div class="repricer-marketplace-grid repricer-game-marketplace" data-repricer-operator-actions>
        ${repricerGameMarketplaceCardHtml(readiness.wb, wbTemplate)}
        ${repricerGameMarketplaceCardHtml(readiness.ozon, ozonTemplate)}
      </div>
    `;
    const readinessBadge = readiness.tone === 'danger'
      ? badge('сначала стопы', 'danger')
      : readiness.tone === 'warn'
        ? badge('нужна проверка', 'warn')
        : badge('можно работать', 'ok');
    const stopSummaryBadge = issueItems
      ? badge('есть стопы', readiness.tone === 'danger' ? 'danger' : 'warn')
      : badge('контур чистый', 'ok');
    root.classList.add('repricer-simple-mode', 'repricer-native-simple');
    root.classList.remove('repricer-simple-expanded');
    root.dataset.repricerNativeSimple = '1';
    root.dataset.repricerLayer = 'simple';
    root.dataset.repricerRenderSignature = renderSignature;
    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>Репрайсер</h2>
          <p>Светофор цен: зелёные можно выгружать, инфо остается в аудите, красные стопорят автоматику.</p>
        </div>
      </div>

      <div class="repricer-operator-panel repricer-human-panel repricer-game-panel" data-repricer-operator-panel data-repricer-native-panel="1">
        <div class="badge-stack repricer-runtime-status" style="margin:0 0 12px">${summaryBadges}</div>
        ${repricerGameHeroHtml(readiness)}
        ${livePriceSyncCard}
        ${priceApplyCard}
        ${repricerMarketplaceHtml}
        ${arrivalSignalCard}
        ${noSafeExport ? `
          <div class="repricer-empty-explain">
            <div>
              <strong>Почему шаблон пустой</strong>
              <p>В WB/Ozon сейчас нет изменений цены без красного стопа. Шаблоны можно скачать для контроля, но сначала лучше выгрузить аудит и закрыть причины ниже.</p>
            </div>
            <div class="repricer-empty-reasons">${emptyExportReasonMarkup || '<div class="repricer-empty-reason"><strong>нет причин</strong><span>0</span><em>Проверьте свежесть данных.</em></div>'}</div>
          </div>
        ` : ''}
        ${awaitingRopFromImport ? `
          <div class="repricer-empty-explain repricer-awaiting-rop-explain">
            <div>
              <strong>Excel принят, но ещё не согласован</strong>
              <p>${fmt.int(awaitingRopFromImport)} строк заполнены и ожидают решения РОП. До выбора «Согласовано» маржа и MIN/MAX не становятся рабочими правилами.</p>
            </div>
            <div class="repricer-empty-reasons">
              <div class="repricer-empty-reason">
                <strong>ожидает РОП</strong>
                <span>${fmt.int(awaitingRopFromImport)}</span>
                <em>Согласовать строки в Excel и загрузить XLSX повторно</em>
              </div>
            </div>
          </div>
        ` : ''}
        <div class="repricer-human-actions" data-repricer-excel-workflow>
          <button type="button" class="quick-chip repricer-audit-primary" data-repricer-export="all">1. Скачать рабочий Excel</button>
          <button type="button" class="quick-chip" data-repricer-import="audit" title="Загрузить обратно заполненный рабочий Excel">2. Загрузить заполненный Excel</button>
        </div>
        <div class="repricer-export-status" data-repricer-export-status>Скачайте один файл, заполните слева маржу, MIN/MAX и нужные изменения, затем загрузите этот же файл обратно.</div>
        <input id="repricerAuditImportInput" class="hidden" type="file" data-repricer-audit-import accept=".xlsx,.xls,.html,.htm,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/html,text/csv,text/tab-separated-values,application/vnd.ms-excel">
      </div>

      <div class="repricer-operator-focus-card" style="margin-top:14px">
        <div class="section-subhead">
          <div>
            <h3>Что делать сейчас</h3>
            <p class="small muted">Очередь действий по текущему контуру цен.</p>
          </div>
          ${readinessBadge}
        </div>
        <div class="repricer-operator-tasks">${taskCards}</div>
      </div>

      <div class="repricer-operator-grid">
        <div class="repricer-operator-focus-card">
          <div class="section-subhead">
            <div>
              <h3>Главные стопы</h3>
              <p class="small muted">Сначала чинить эти причины, потом выгружать цены.</p>
            </div>
            ${stopSummaryBadge}
          </div>
          <div class="repricer-operator-issues">${issueItems || '<div class="muted small">Критичных стопов сейчас нет.</div>'}</div>
        </div>
        <div class="repricer-operator-focus-card">
          <div class="section-subhead">
            <div>
              <h3>Первые SKU</h3>
              <p class="small muted">Самые заметные строки для проверки.</p>
            </div>
            ${badge(`в очереди ${fmt.int(queueRows.length)}`, 'info')}
          </div>
          <div class="repricer-operator-sku-list">${queueMarkup || '<div class="muted small">Очередь проверки пуста.</div>'}</div>
        </div>
      </div>
      <details class="repricer-game-details">
        <summary>Подробная диагностика и правила</summary>
        <div class="repricer-game-details-body">
          <div class="quick-actions">
            <button type="button" class="quick-chip repricer-advanced-toggle" data-repricer-layer-toggle="advanced">Открыть технический режим</button>
          </div>
          <div class="repricer-operator-focus-card">
            <div class="section-subhead">
              <div>
                <h3>Быстрые пачки</h3>
                <p class="small muted">Короткие выгрузки только по одной причине.</p>
              </div>
              ${badge('без автозаписи', 'info')}
            </div>
            <div class="quick-actions" style="margin-top:12px">${batchButtons}</div>
          </div>
          ${safetyCard}
          ${templateExplainCard}
          ${renderRepricerRepairStatusCard()}
          ${renderRepricerFixTeamCard(sourceRows)}
          ${renderRepricerWorkLogicCard()}
        </div>
      </details>
      <div class="badge-stack" style="margin-top:12px">${summaryBadges}</div>
    `;
    attachRepricerEvents(root);
    return;
  }

  root.classList.remove('repricer-simple-mode', 'repricer-boot-simple', 'repricer-native-simple');
  delete root.dataset.repricerNativeSimple;
  root.dataset.repricerLayer = 'advanced';
  root.dataset.repricerRenderSignature = renderSignature;
  const rows = getFilteredRepricerRows(sourceRows);
  const visibleRows = repricerVisibleRows(rows);
  const visibleHidden = Math.max(0, rows.length - visibleRows.length);
  const listSize = state.repricerFilters.listSize || 'focus';
  const duplicateNames = buildRepricerDuplicateNameMap(sourceRows);
  const settings = normalizeRepricerSettings(state.storage?.repricerSettings || {});
  const brandNames = [...new Set([
    ...Object.keys(defaultRepricerSettings().brandRules || {}),
    ...Object.keys(settings.brandRules || {}),
    ...sourceRows.map((row) => repricerCanonicalBrandName(row.brand)).filter(Boolean)
  ])].sort((a, b) => a.localeCompare(b, 'ru'));
  const lifecycleStatusLabels = Object.values(window.PRODUCT_LIFECYCLE_STATUS_META || {})
    .map((item) => item?.label)
    .filter(Boolean);
  const statuses = [...new Set([...lifecycleStatusLabels, ...Object.keys(defaultRepricerSettings().statusRules), ...sourceRows.map((row) => row.status).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'ru'));
  const roles = [...new Set([...Object.keys(defaultRepricerSettings().roleRules), ...Object.keys(settings.roleRules || {}), ...sourceRows.map((row) => row.role).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'ru'));
  const feePlatforms = [...new Set([...Object.keys(defaultRepricerSettings().feeRules), ...Object.keys(settings.feeRules || {}), 'wb', 'ozon'])];
  const cards = [
    { label: 'SKU в контуре', value: sourceRows.length, hint: 'Все SKU, которые уже кормятся от smart price workbench.' },
    { label: 'Нужны решения', value: actionableRows, hint: 'Есть разница между текущей и рекомендованной ценой.' },
    { label: 'Пришёл → цена', value: arrivalSignalStats.total.check, hint: 'Товар уже на площадке/отгружен, но цена требует проверки.' },
    { label: 'WB / Ozon сигнал', value: `${fmt.int(arrivalSignalStats.wb.check)} / ${fmt.int(arrivalSignalStats.ozon.check)}`, hint: 'Проверки цены отдельно по площадкам.' },
    { label: 'Профили SKU', value: sourceRows.filter((row) => row.hasManagedProfile).length, hint: 'Статус, роль или launch-профиль уже правили на портале.' },
    { label: 'Коридоры площадок', value: sideRows.filter((side) => side.hasCorridor).length, hint: 'По площадке уже задан отдельный ценовой коридор.' },
    { label: 'Ручные решения', value: manualOverrideRows, hint: 'Портал уже вмешался в базовый расчёт.' },
    { label: 'Режимы stop', value: sideRows.filter((side) => ['freeze', 'hold', 'force', 'off'].includes(side.mode)).length, hint: 'Количество площадок с ручным или статусным стопом.' },
    { label: 'Нет входов', value: blockedGateSides, hint: 'Не хватает обязательных входов: цены, рабочего MIN или себестоимости.' },
    { label: 'Стоп до READY', value: launchHoldSides, hint: 'Новинки и перезапуски сдерживаются до READY.' },
    { label: 'Поднять до MIN', value: floorRaiseReadySides, hint: 'Текущая цена ниже рабочего MIN, финальная цена поднимает её до порога.' },
    { label: 'Ниже MIN вручную', value: belowMinSides, hint: 'Ниже рабочего порога, но автоматическое поднятие не прошло проверки.' },
    { label: 'Риск маржи', value: sideRows.filter((side) => side.marginRisk).length, hint: 'Маржа ниже рабочего порога.' },
    { label: 'Можно выровнять', value: alignmentEligibleRows, hint: 'SKU, где можно запускать scoring alignment WB/Ozon.' },
    { label: 'Уже выровнены', value: alignmentChangedRows, hint: 'Сценарий follow победил keep по score-модели.' },
    { label: 'Проверка сценариев', value: `${fmt.int(smokePassed)}/${fmt.int(smokeTests.length)}`, hint: 'Базовые тест-кейсы: AUTO, LAUNCH, FREEZE, OOS, KEEP и PROMO_OFFER.' },
    { label: 'Полная экономика', value: feeStackSides, hint: 'Площадки, где economic floor считается прямо из себестоимости и fee stack.' },
    { label: 'Защита snapshot', value: mixedGuardSides, hint: 'Есть cost, но итоговый economic floor всё ещё держится на страхующем snapshot-ограничении.' },
    { label: 'Fallback экономика', value: fallbackSides, hint: 'Нет полного fee-stack, расчет защищен snapshot и текущим smart-срезом.' },
    { label: 'Предложения акций', value: promoOfferSides, hint: 'Read-only promo offers из текущих слоев фактов, без новых таблиц.' },
    { label: 'Есть live-ориентир', value: liveBenchmarkSides, hint: 'Площадки, где есть живая рекомендация текущего репрайсера.' },
    { label: 'Расходятся с live', value: liveDriftSides, hint: 'Наш финал заметно расходится с живым repricer rec.' },
    { label: 'Дубли карточек', value: duplicateNames.duplicateRows, hint: 'Proxy-контроль по названию карточки: в текущем слое нет отдельного поля описания.' }
  ].map((card) => `<div class="card kpi control-card"><div class="label">${escapeHtml(card.label)}</div><div class="value">${typeof card.value === 'string' ? escapeHtml(card.value) : fmt.int(card.value)}</div><div class="hint">${escapeHtml(card.hint)}</div></div>`).join('');

  root.innerHTML = `
    <div class="section-title">
      <div>
        <h2>Репрайсер</h2>
        <p>Здесь связываются три вещи: рабочие MIN/MAX из «Цен», рекомендация модели и ручные решения по конкретной площадке.</p>
      </div>
      <div class="quick-actions" data-repricer-excel-workflow>
        <button type="button" class="quick-chip repricer-audit-primary" data-repricer-export="all">1. Скачать рабочий Excel</button>
        <button type="button" class="quick-chip" data-repricer-import="audit" title="Загрузить обратно заполненный рабочий Excel">2. Загрузить заполненный Excel</button>
        <button type="button" class="quick-chip" data-repricer-layer-toggle="simple">Простой режим</button>
      </div>
      <div class="small muted repricer-export-status" data-repricer-export-status>Один рабочий файл: заполните слева маржу, MIN/MAX и нужные изменения; пустые поля ничего не меняют.</div>
      <input id="repricerAuditImportInput" class="hidden" type="file" data-repricer-audit-import accept=".xlsx,.xls,.html,.htm,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/html,text/csv,text/tab-separated-values,application/vnd.ms-excel">
    </div>

    <div class="badge-stack" style="margin-top:8px">${badge(`обновлено ${state.smartPriceWorkbench?.generatedAt ? fmt.date(state.smartPriceWorkbench.generatedAt) : '—'}`, 'info')}${badge(state.smartPriceWorkbench?.liveEnrichmentUsed ? 'слой: workbench + live' : 'слой: workbench', 'ok')}${state.smartPriceWorkbench?.liveEnrichmentAt ? badge(`live ${fmt.date(state.smartPriceWorkbench.liveEnrichmentAt)}`, 'info') : ''}${badge(hasRemoteStore() ? 'решения: команда' : 'решения: локально', hasRemoteStore() ? 'ok' : 'info')}</div>
    <div class="muted small" style="margin-top:8px">Проверка дублей в репрайсере сейчас идёт по совпадающим названиям карточек. Если названия похожи, дополнительно сверяйте артикул и площадку перед выгрузкой.</div>

    ${livePriceSyncCard}
    ${priceApplyCard}
    ${safetyCard}
    ${arrivalSignalCard}
    ${templateExplainCard}
    ${renderRepricerRepairStatusCard()}
    ${renderRepricerFixTeamCard(sourceRows)}
    ${renderRepricerWorkLogicCard()}
    ${renderRepricerWorkflowGuide()}
    ${renderRepricerSignalsCard(summaryBadges, techBadges, health.ok)}

    <div class="grid cards">${cards}</div>

    <div class="card" style="margin-top:14px">
      <div class="section-subhead">
        <div>
          <h3>Перед выгрузкой в Excel</h3>
          <p class="small muted">Короткий контроль перед отправкой шаблонов WB/Ozon. Если здесь красное, выгрузку лучше перепроверить.</p>
      </div>
      <div class="badge-stack">${health.ok ? badge('можно выгружать', 'ok') : badge('нужна проверка', 'warn')}</div>
      </div>
      <div class="badge-stack" style="margin-top:10px">
        ${badge(`нет входов ${fmt.int(health.metrics.blocked_gate)}`, health.metrics.blocked_gate ? 'danger' : 'ok')}
        ${badge(`вне спецификации ${fmt.int(health.metrics.out_of_spec_rows)}`, health.metrics.out_of_spec_rows ? 'info' : '')}
        ${badge(`промо ${fmt.int(health.metrics.promo_rows)}`, health.metrics.promo_rows ? 'warn' : 'info')}
        ${badge(`нет цены к решению ${fmt.int(health.metrics.missing_current_price_actionable)}`, health.metrics.missing_current_price_actionable ? 'danger' : 'ok')}
        ${badge(`без цены, не блокирует ${fmt.int(Math.max(0, numberOrZero(health.metrics.missing_current_price) - numberOrZero(health.metrics.missing_current_price_actionable)))}`, numberOrZero(health.metrics.missing_current_price) > numberOrZero(health.metrics.missing_current_price_actionable) ? 'info' : '')}
        ${badge(`нет себестоимости к решению ${fmt.int(health.metrics.missing_cost_actionable)}`, health.metrics.missing_cost_actionable ? 'danger' : 'ok')}
        ${badge(`fallback экономика ${fmt.int(health.metrics.fallback_rows)}`, health.metrics.fallback_rows ? 'info' : 'ok')}
        ${badge(`без cost, но защищено ${fmt.int(health.metrics.protected_without_cost)}`, health.metrics.protected_without_cost ? 'info' : '')}
        ${badge(`нет MIN к решению ${fmt.int(health.metrics.missing_effective_floor_actionable)}`, health.metrics.missing_effective_floor_actionable ? 'danger' : 'ok')}
        ${badge(`без MIN, не блокирует ${fmt.int(Math.max(0, numberOrZero(health.metrics.missing_effective_floor) - numberOrZero(health.metrics.missing_effective_floor_actionable)))}`, numberOrZero(health.metrics.missing_effective_floor) > numberOrZero(health.metrics.missing_effective_floor_actionable) ? 'info' : '')}
        ${badge(`изменения WB ${fmt.int(health.metrics.wb_change_rows)}`, health.metrics.wb_change_rows ? 'info' : '')}
        ${badge(`изменения Ozon ${fmt.int(health.metrics.ozon_change_rows)}`, health.metrics.ozon_change_rows ? 'info' : '')}
      </div>
      <div class="muted small" style="margin-top:10px">${health.issues.length ? escapeHtml(health.issues.join(' · ')) : 'Критичных замечаний нет.'}</div>
      ${renderRepricerSmokeTests(smokeTests, smokePassed)}
    </div>

    <div class="filters repricer-filters" style="margin-top:14px">
      <input id="repricerSearchInput" placeholder="Поиск по артикулу, названию, owner или причине…" value="${escapeHtml(state.repricerFilters.search)}">
      <select id="repricerPlatformFilter">
        <option value="all" ${state.repricerFilters.platform === 'all' ? 'selected' : ''}>WB + Ozon</option>
        <option value="wb" ${state.repricerFilters.platform === 'wb' ? 'selected' : ''}>Только WB</option>
        <option value="ozon" ${state.repricerFilters.platform === 'ozon' ? 'selected' : ''}>Только Ozon</option>
      </select>
        <select id="repricerModeFilter">
          <option value="changes" ${state.repricerFilters.mode === 'changes' ? 'selected' : ''}>Нужны действия по цене</option>
          <option value="arrival_price_check" ${state.repricerFilters.mode === 'arrival_price_check' ? 'selected' : ''}>Авто-сигнал: пришёл → цена</option>
          <option value="manual" ${state.repricerFilters.mode === 'manual' ? 'selected' : ''}>Есть ручные решения</option>
        <option value="promo" ${state.repricerFilters.mode === 'promo' ? 'selected' : ''}>Есть промо</option>
        <option value="blocked" ${state.repricerFilters.mode === 'blocked' ? 'selected' : ''}>Пауза (стоп / нет данных)</option>
        <option value="below_min" ${state.repricerFilters.mode === 'below_min' ? 'selected' : ''}>Ниже рабочего MIN</option>
        <option value="margin_risk" ${state.repricerFilters.mode === 'margin_risk' ? 'selected' : ''}>Риск маржи</option>
        <option value="live_benchmark" ${state.repricerFilters.mode === 'live_benchmark' ? 'selected' : ''}>Есть live ориентир</option>
        <option value="live_drift" ${state.repricerFilters.mode === 'live_drift' ? 'selected' : ''}>Сильно расходится с live</option>
        <option value="all" ${state.repricerFilters.mode === 'all' ? 'selected' : ''}>Все SKU</option>
      </select>
      <select id="repricerEconomicFilter">
        <option value="all" ${state.repricerFilters.economicSource === 'all' ? 'selected' : ''}>Экономика: все варианты</option>
        <option value="ready" ${state.repricerFilters.economicSource === 'ready' ? 'selected' : ''}>Экономика подтверждена</option>
        <option value="fee_stack" ${state.repricerFilters.economicSource === 'fee_stack' ? 'selected' : ''}>Себестоимость + комиссии</option>
        <option value="snapshot_guard" ${state.repricerFilters.economicSource === 'snapshot_guard' ? 'selected' : ''}>Себестоимость есть, но с guard</option>
        <option value="snapshot_fallback" ${state.repricerFilters.economicSource === 'snapshot_fallback' ? 'selected' : ''}>Fallback экономика</option>
      </select>
      <select id="repricerListSizeFilter">
        <option value="focus" ${listSize === 'focus' ? 'selected' : ''}>Первые 20 SKU</option>
        <option value="expanded" ${listSize === 'expanded' ? 'selected' : ''}>Первые 60 SKU</option>
        <option value="all" ${listSize === 'all' ? 'selected' : ''}>Все SKU</option>
      </select>
    </div>
    <div class="quick-actions" style="margin-top:10px">
      <button type="button" class="quick-chip ${state.repricerFilters.mode === 'changes' ? 'active' : ''}" data-repricer-quick-mode="changes">Требуют решения</button>
      <button type="button" class="quick-chip ${state.repricerFilters.mode === 'arrival_price_check' ? 'active' : ''}" data-repricer-quick-mode="arrival_price_check">Пришёл → цена</button>
      <button type="button" class="quick-chip ${state.repricerFilters.mode === 'manual' ? 'active' : ''}" data-repricer-quick-mode="manual">Ручные решения</button>
      <button type="button" class="quick-chip ${state.repricerFilters.mode === 'below_min' ? 'active' : ''}" data-repricer-quick-mode="below_min">Ниже MIN</button>
      <button type="button" class="quick-chip ${state.repricerFilters.mode === 'promo' ? 'active' : ''}" data-repricer-quick-mode="promo">Промо</button>
      <button type="button" class="quick-chip ${state.repricerFilters.mode === 'all' ? 'active' : ''}" data-repricer-quick-mode="all">Все SKU</button>
    </div>
    <div class="quick-actions" style="margin-top:10px">
      <button type="button" class="quick-chip ${listSize === 'focus' ? 'active' : ''}" data-repricer-list-size="focus">20 SKU</button>
      <button type="button" class="quick-chip ${listSize === 'expanded' ? 'active' : ''}" data-repricer-list-size="expanded">60 SKU</button>
      <button type="button" class="quick-chip ${listSize === 'all' ? 'active' : ''}" data-repricer-list-size="all">Все SKU</button>
    </div>
    <div class="muted small" style="margin-top:8px">По фильтрам найдено ${fmt.int(rows.length)} SKU. На экране показываем ${fmt.int(visibleRows.length)}${visibleHidden ? `, ещё ${fmt.int(visibleHidden)} остаются в полной Excel-выгрузке` : ''}. Фильтр экономики: ${escapeHtml(repricerEconomicSourceLabel(state.repricerFilters.economicSource))}.</div>

    ${renderRepricerSettingsCard(settings, brandNames, statuses, roles, feePlatforms)}

    <div class="repricer-stack">
      ${visibleRows.map((row) => {
        const displayOwner = repricerOwnerForPlatform(row, state.repricerFilters.platform || 'all');
        const profileMarginRatio = repricerMarginRatio(row.profile?.targetMarginPct);
        const profileMarginPercent = profileMarginRatio > 0 ? repricerExportNumber(profileMarginRatio * 100, 1) : '';
        const duplicateEntry = duplicateNames.byArticle.get(String(row.articleKey || '').trim());
        const duplicatePeers = (duplicateEntry?.articles || [])
          .filter((article) => article !== String(row.article || row.articleKey || '').trim())
          .slice(0, 4);
        return `<div class="card repricer-card"><div class="head"><div><strong>${linkToSku(row.articleKey, row.article || row.articleKey)}</strong><div class="muted small">${escapeHtml(row.name || 'Без названия')} · ${escapeHtml(displayOwner || 'Без owner')}</div>${duplicatePeers.length ? `<div class="muted small" style="margin-top:6px">Похожие карточки: ${escapeHtml(duplicatePeers.join(', '))}</div>` : ''}</div><div class="badge-stack">${row.brand ? badge(row.brand, 'info') : ''}${badge(row.status || 'Статус не указан')}${row.productLifecycle?.key && row.productLifecycle.key !== 'active' ? badge(`товар: ${row.productLifecycle.label || row.productLifecycle.status || row.productLifecycle.key}`, row.productLifecycle.tone || 'warn') : ''}${badge(`роль ${row.role || '—'}`, 'info')}${badge(row.launchReady === 'READY' ? 'готов к запуску' : 'hold до запуска', row.launchReady === 'READY' ? 'ok' : 'warn')}${row.segment ? badge(row.segment, 'info') : ''}${row.abc ? badge(`ABC ${row.abc}`) : ''}${row.hasManagedProfile ? badge('профиль SKU', 'ok') : ''}${row.hasCorridor ? badge('коридор', 'info') : ''}${row.hasManualOverride ? badge('ручное решение', 'warn') : ''}${duplicateEntry ? badge(`дубль названия x${fmt.int(duplicateEntry.count)}`, 'warn') : ''}</div></div>${repricerProductLifecycleEditorHtml(row)}<details style="margin:10px 0"><summary class="small muted" style="cursor:pointer">Настроить профиль SKU</summary><form class="repricer-sku-form" data-article-key="${escapeHtml(row.articleKey)}" style="margin-top:10px"><div class="filters repricer-filters"><select name="status">${statuses.map((status) => `<option value="${escapeHtml(status)}" ${row.status === status ? 'selected' : ''}>${escapeHtml(status)}</option>`).join('')}</select><select name="role">${roles.map((role) => `<option value="${escapeHtml(role)}" ${row.role === role ? 'selected' : ''}>${escapeHtml(role)}</option>`).join('')}</select><select name="launchReady"><option value="READY" ${row.launchReady === 'READY' ? 'selected' : ''}>READY</option><option value="HOLD" ${row.launchReady !== 'READY' ? 'selected' : ''}>HOLD</option></select><input type="number" step="0.1" min="0.1" max="99.9" name="targetMarginPct" value="${escapeHtml(profileMarginPercent)}" placeholder="Маржа SKU, %"></div><div class="muted small" style="margin-top:8px">Маржа SKU — первое ограничение цены. Для актуального товара, новинки и перезапуска итог не может быть ниже этого порога; затем применяются MIN/MAX.</div><div class="quick-actions" style="margin-top:10px"><button type="submit" class="quick-chip">Сохранить профиль</button><button type="button" class="quick-chip" data-repricer-sku-reset data-article-key="${escapeHtml(row.articleKey)}">Сбросить профиль</button></div></form></details><div class="repricer-side-grid ${state.repricerFilters.platform !== 'all' ? 'single' : ''}">${state.repricerFilters.platform !== 'ozon' ? renderRepricerSide('WB', row.wb) : ''}${state.repricerFilters.platform !== 'wb' ? renderRepricerSide('Ozon', row.ozon) : ''}</div></div>`;
      }).join('') || '<div class="empty">По выбранным фильтрам репрайсер ничего не показал.</div>'}
    </div>
  `;

  attachRepricerEvents(root);
}

function getOrderCalcBase() {
  const sku = getSku(state.orderCalc.articleKey || state.skus[0]?.articleKey);
  if (!sku) return null;
  const productLifecycle = repricerProductLifecycleForRecord(sku, sku?.status || sku?.productStatus || '', sku?.articleKey || sku?.article || sku?.sku);
  const orderBlockedByLifecycle = productLifecycleBlocksAutoOrder(productLifecycle);
  const scope = state.orderCalc.scope || 'all';
  const wbStock = numberOrZero(sku?.wb?.stock);
  const ozonStock = numberOrZero(sku?.ozon?.stockProducts ?? sku?.ozon?.stock);
  const autoInTransit = numberOrZero(sku?.ozon?.stockInTransit) + numberOrZero(sku?.ozon?.stockInSupplyRequest);
  const availableNow = scope === 'wb' ? wbStock : scope === 'ozon' ? ozonStock : wbStock + ozonStock;
  const ordersDaily = numberOrZero(sku?.orders?.units) / 27;
  const planDaily = currentPlanDailyUnits(sku);
  const factDaily = currentFactDailyUnits(sku);
  let dailySales = Math.max(ordersDaily, planDaily, factDaily);
  if (state.orderCalc.salesSource === 'orders') dailySales = ordersDaily;
  if (state.orderCalc.salesSource === 'plan') dailySales = planDaily || factDaily || ordersDaily;
  if (state.orderCalc.salesSource === 'manual') dailySales = numberOrZero(state.orderCalc.manualDailySales);

  const daysToNextReceipt = numberOrZero(state.orderCalc.daysToNextReceipt) || numberOrZero(sku?.leadTimeDays) || 30;
  const targetCoverAfter = numberOrZero(state.orderCalc.targetCoverAfter) || 30;
  const safetyDays = numberOrZero(state.orderCalc.safetyDays) || 7;
  const inbound = state.orderCalc.inboundManual === '' ? autoInTransit : numberOrZero(state.orderCalc.inboundManual);
  const totalHorizon = daysToNextReceipt + targetCoverAfter + safetyDays;
  const demandUnits = dailySales * totalHorizon;
  const rawOrderQty = Math.max(0, demandUnits - availableNow - inbound);
  const moq = Math.max(0, numberOrZero(state.orderCalc.moq));
  const packSize = Math.max(1, numberOrZero(state.orderCalc.packSize));
  let finalQty = orderBlockedByLifecycle ? 0 : rawOrderQty;
  if (finalQty > 0 && moq > 0) finalQty = Math.max(finalQty, moq);
  if (finalQty > 0) finalQty = Math.ceil(finalQty / packSize) * packSize;
  const coverageNowDays = dailySales > 0 ? availableNow / dailySales : null;
  const stockoutRisk = coverageNowDays != null && coverageNowDays < daysToNextReceipt;
  const summaryText = `${sku.article || sku.articleKey}: РїСЂРё СЃРєРѕСЂРѕСЃС‚Рё ${fmt.num(dailySales, 1)} С€С‚./РґРµРЅСЊ, РіРѕСЂРёР·РѕРЅС‚Рµ ${fmt.int(totalHorizon)} РґРЅ., РЅР°Р»РёС‡РёРё ${fmt.int(availableNow)} С€С‚. Рё РІС…РѕРґСЏС‰РµРј Р·Р°РїР°СЃРµ ${fmt.int(inbound)} С€С‚. СЂРµРєРѕРјРµРЅРґРѕРІР°РЅРЅС‹Р№ Р·Р°РєР°Р· = ${fmt.int(finalQty)} С€С‚.`;
  return {
    sku,
    productLifecycle,
    orderBlockedByLifecycle,
    blockedOrderQty: orderBlockedByLifecycle ? rawOrderQty : 0,
    scope,
    availableNow,
    wbStock,
    ozonStock,
    autoInTransit,
    inbound,
    dailySales,
    ordersDaily,
    planDaily,
    factDaily,
    daysToNextReceipt,
    targetCoverAfter,
    safetyDays,
    totalHorizon,
    demandUnits,
    rawOrderQty,
    finalQty,
    coverageNowDays,
    stockoutRisk,
    summaryText
  };
}

function renderOrderCalculator() {
  const root = document.getElementById('view-order');
  if (!root) return;
  injectOrderProcurementStyles();
  orderProcurementPrimeCacheFromState();
  const renderToken = ++ORDER_PROCUREMENT_RUNTIME.renderToken;
  const hasProcurementMounted = () => Boolean(root.querySelector('[data-altea-order-procurement]'));
  const renderIfChanged = () => {
    const signature = orderProcurementBuildRenderSignature();
    if (hasProcurementMounted() && ORDER_PROCUREMENT_RUNTIME.lastRenderedSignature === signature) return false;
    orderProcurementRenderInto(root);
    ORDER_PROCUREMENT_RUNTIME.lastRenderedSignature = signature;
    return true;
  };

  if (orderProcurementHasReadyData()) {
    try {
      renderIfChanged();
    } catch (error) {
      console.error('[order-procurement] sync render', error);
    }
  } else if (!hasProcurementMounted()) {
    root.innerHTML = renderOrderProcurementLoading();
  }

  const platform = ensureOrderProcurementState().platform;
  ensureOrderProcurementSources(platform)
    .then(() => {
      if (renderToken !== ORDER_PROCUREMENT_RUNTIME.renderToken) return;
      renderIfChanged();
    })
    .catch((error) => {
      if (renderToken !== ORDER_PROCUREMENT_RUNTIME.renderToken) return;
      console.error('[order-procurement] render', error);
      ORDER_PROCUREMENT_RUNTIME.lastRenderedSignature = '';
      if (orderProcurementHasReadyData()) {
        renderIfChanged();
        return;
      }
      root.innerHTML = renderOrderProcurementError();
    });
}

const ORDER_PROCUREMENT_VERSION = '20260522ymstock1';
const ORDER_PROCUREMENT_STYLE_ID = `altea-order-procurement-${ORDER_PROCUREMENT_VERSION}`;
const ORDER_PROCUREMENT_RUNTIME = {
  renderToken: 0,
  cache: {
    skus: null,
    warehouse: null,
    combined: null,
    wb: null,
    ozon: null,
    ym: null
  },
  pending: new Map(),
  lastRenderedSignature: '',
  searchDebounceTimer: 0
};

function orderProcurementPayloadLooksUsable(payload) {
  return Boolean(payload && typeof payload === 'object' && Array.isArray(payload.rows) && payload.rows.length > 0);
}

function orderProcurementLooksLikeDataPayload(value) {
  return Boolean(value && typeof value === 'object' && (
    Array.isArray(value.rows) ||
    Boolean(value.window && typeof value.window === 'object') ||
    Boolean(value.generatedAt || value.updatedAt || value.updated_at || value.asOfDate)
  ));
}

function orderProcurementPrimeCacheSlot(slot, payload) {
  if (!orderProcurementPayloadLooksUsable(payload)) return false;
  const current = ORDER_PROCUREMENT_RUNTIME.cache[slot];
  if (
    !orderProcurementPayloadLooksUsable(current) ||
    orderProcurementFreshnessScore(payload) > orderProcurementFreshnessScore(current)
  ) {
    ORDER_PROCUREMENT_RUNTIME.cache[slot] = payload;
    return true;
  }
  return false;
}

function orderProcurementPrimeCacheFromState() {
  if (typeof state !== 'object' || !state) return;
  if (Array.isArray(state.skus) && state.skus.length) {
    ORDER_PROCUREMENT_RUNTIME.cache.skus = state.skus;
  }
  orderProcurementPrimeCacheSlot('warehouse', state.warehouseStockOverlay || state.warehouse_stock_overlay);
  orderProcurementPrimeCacheSlot(
    'combined',
    state.orderProcurementSnapshot ||
      state.orderProcurementData ||
      state.orderProcurementCombined ||
      state.order_procurement ||
      state.orderProcurement
  );
  orderProcurementPrimeCacheSlot('wb', state.orderProcurementWb || state.orderProcurementWB || state.order_procurement_wb);
  orderProcurementPrimeCacheSlot('ozon', state.orderProcurementOzon || state.orderProcurementOZON || state.order_procurement_ozon);
  orderProcurementPrimeCacheSlot('ym', state.orderProcurementYm || state.orderProcurementYM || state.order_procurement_ym);
}

function ensureOrderProcurementState() {
  const existingUi = state.orderProcurementUi && typeof state.orderProcurementUi === 'object' && !orderProcurementLooksLikeDataPayload(state.orderProcurementUi)
    ? state.orderProcurementUi
    : {};
  const legacyUi = state.orderProcurement && typeof state.orderProcurement === 'object' && !orderProcurementLooksLikeDataPayload(state.orderProcurement)
    ? state.orderProcurement
    : {};
  const orderState = { ...legacyUi, ...existingUi };
  state.orderProcurementUi = orderState;
  state.orderProcurementFilters = orderState;
  orderState.platform = ['ozon', 'ym'].includes(orderState.platform) ? orderState.platform : 'wb';
  orderState.days = clampOrderProcurementDays(orderState.days);
  orderState.search = String(orderState.search || '').trim();
  orderState.place = String(orderState.place || 'all').trim() || 'all';
  const placeSelection = Array.isArray(orderState.placeSelection)
    ? orderState.placeSelection
    : (Array.isArray(orderState.selectedPlaces) ? orderState.selectedPlaces : []);
  orderState.placeSelection = orderProcurementUnique(placeSelection
    .map((place) => String(place || '').trim())
    .filter((place) => place && place !== 'all'));
  if (!orderState.placeSelection.length && orderState.place !== 'all') {
    orderState.placeSelection = [orderState.place];
  }
  orderState.clusterFilter = [
    'all',
    'risk',
    'turnover_lt',
    'low_stock',
    'need',
    'no_stock',
    'in_motion'
  ].includes(orderState.clusterFilter) ? orderState.clusterFilter : 'all';
  orderState.clusterDays = clampOrderProcurementDays(orderState.clusterDays || 30);
  orderState.mode = [
    'all',
    'recommended',
    'local',
    'supplier',
    'warehouse',
    'signals'
  ].includes(orderState.mode) ? orderState.mode : 'all';
  orderState.sort = [
    'recommended_desc',
    'warehouse_desc',
    'warehouse_asc',
    'turnover_asc',
    'turnover_desc',
    'local_desc',
    'supplier_desc',
    'inbound_desc',
    'sku_asc'
  ].includes(orderState.sort) ? orderState.sort : 'recommended_desc';
  return orderState;
}

function clampOrderProcurementDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(180, Math.round(parsed)));
}

function orderProcurementNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function orderProcurementEscape(value) {
  return escapeHtml(value == null ? '' : String(value));
}

function orderProcurementNormalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function orderProcurementUnique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function orderProcurementBadge(text, tone = '') {
  return badge(text, tone);
}

function orderProcurementTurnoverTone(value) {
  if (!Number.isFinite(Number(value))) return 'info';
  if (Number(value) < 7) return 'danger';
  if (Number(value) < 14) return 'warn';
  return 'ok';
}

function orderProcurementTurnoverBadge(value) {
  if (!Number.isFinite(Number(value))) return orderProcurementBadge('n/a', 'info');
  return orderProcurementBadge(`${fmt.num(value, 1)} РґРЅ.`, orderProcurementTurnoverTone(value));
}

function orderProcurementFormatDateTime(value) {
  if (!value) return 'РїРѕСЃР»РµРґРЅРёР№ РґРѕСЃС‚СѓРїРЅС‹Р№ СЃСЂРµР·';
  try {
    return new Date(value).toLocaleString('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  } catch {
    return String(value);
  }
}

function orderProcurementResolvedPath(path) {
  return path.includes('?') ? path : `${path}?v=${ORDER_PROCUREMENT_VERSION}`;
}

function orderProcurementSnapshotPayloadUsable(path, payload) {
  if (!payload || typeof payload !== 'object') return false;
  const normalizedPath = String(path || '').replace(/\\/g, '/').split('?')[0];
  if (normalizedPath.endsWith('.gz')) return false;
  if (normalizedPath.includes('warehouse_stock_overlay')) return Array.isArray(payload.rows) && payload.rows.length > 0;
  if (normalizedPath.includes('order_procurement')) return Array.isArray(payload.rows) && payload.rows.length > 0;
  return false;
}

function orderProcurementFreshnessScore(payload) {
  if (!payload || typeof payload !== 'object') return 0;
  const stamps = [
    payload.generatedAt,
    payload.updatedAt,
    payload.updated_at,
    payload.asOfDate,
    payload.window?.to,
    payload.dataFreshness?.asOfDate
  ];
  return stamps.reduce((score, value) => {
    if (!value) return score;
    const raw = String(value || '').trim();
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw;
    const stamp = Date.parse(normalized);
    return Number.isFinite(stamp) ? Math.max(score, stamp) : score;
  }, 0);
}

function orderProcurementTodayFreshnessScore() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

async function orderProcurementFetchSnapshot(path) {
  if (typeof window.__alteaLoadPortalSnapshot !== 'function') return null;
  if (String(path || '').replace(/\\/g, '/').split('?')[0].endsWith('.gz')) return null;
  try {
    const payload = await window.__alteaLoadPortalSnapshot(path);
    return orderProcurementSnapshotPayloadUsable(path, payload) ? payload : null;
  } catch (error) {
    console.warn('[order-procurement] snapshot', path, error);
    return null;
  }
}

async function orderProcurementParseResponse(response, path) {
  if (!response.ok) throw new Error(`РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ ${path}`);

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const isGzip =
    path.endsWith('.gz') ||
    contentType.includes('application/gzip') ||
    contentType.includes('application/x-gzip') ||
    contentType.includes('gzip');

  let text = '';
  if (isGzip) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error(`Р‘СЂР°СѓР·РµСЂ РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚ СЂР°СЃРїР°РєРѕРІРєСѓ gzip РґР»СЏ ${path}`);
    }
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else {
    text = await response.text();
  }

  return JSON.parse(sanitizeLooseJson(text));
}

async function orderProcurementFetchJson(paths) {
  let lastError = null;
  for (const path of paths) {
    try {
      const snapshotPromise = orderProcurementFetchSnapshot(path);
      const response = await fetch(orderProcurementResolvedPath(path), { cache: 'no-store' });
      const localPayload = await orderProcurementParseResponse(response, path);
      const localFreshness = orderProcurementFreshnessScore(localPayload);
      if (localFreshness >= orderProcurementTodayFreshnessScore()) return localPayload;
      const snapshotPayload = await snapshotPromise;
      if (
        orderProcurementSnapshotPayloadUsable(path, snapshotPayload)
        && orderProcurementFreshnessScore(snapshotPayload) > localFreshness
      ) {
        return snapshotPayload;
      }
      return localPayload;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ order-С„Р°Р№Р»С‹.');
}

function orderProcurementLoadCached(key, loader) {
  if (ORDER_PROCUREMENT_RUNTIME.cache[key]) {
    return Promise.resolve(ORDER_PROCUREMENT_RUNTIME.cache[key]);
  }
  if (ORDER_PROCUREMENT_RUNTIME.pending.has(key)) {
    return ORDER_PROCUREMENT_RUNTIME.pending.get(key);
  }

  const promise = Promise.resolve()
    .then(loader)
    .then((data) => {
      ORDER_PROCUREMENT_RUNTIME.cache[key] = data;
      return data;
    })
    .finally(() => {
      ORDER_PROCUREMENT_RUNTIME.pending.delete(key);
    });

  ORDER_PROCUREMENT_RUNTIME.pending.set(key, promise);
  return promise;
}

async function ensureOrderProcurementSources(platform = 'wb') {
  orderProcurementPrimeCacheFromState();
  const normalizedPlatform = platform === 'ozon' || platform === 'ym' ? platform : 'wb';
  const hasPlatformRows = (payload, targetPlatform) => {
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    if (!rows.length) return false;
    return rows.some((row) => orderProcurementNormalizeKey(row?.platform) === targetPlatform);
  };

  if (Array.isArray(state.skus) && state.skus.length) {
    ORDER_PROCUREMENT_RUNTIME.cache.skus = state.skus;
  } else {
    await orderProcurementLoadCached('skus', () => loadJson('data/skus.json'));
  }

  await orderProcurementLoadCached('warehouse', async () => {
    try {
      return await orderProcurementFetchJson(['data/warehouse_stock_overlay.json', 'data/warehouse_stock_overlay.json.gz']);
    } catch (error) {
      console.warn('[order-procurement] warehouse overlay', error);
      return { generatedAt: '', rows: [] };
    }
  });

  if (!ORDER_PROCUREMENT_RUNTIME.cache.combined) {
    try {
      await orderProcurementLoadCached('combined', () => orderProcurementFetchJson(['data/order_procurement.json', 'data/order_procurement.json.gz']));
    } catch (combinedError) {
      if (normalizedPlatform === 'wb' && !ORDER_PROCUREMENT_RUNTIME.cache.wb) {
        await orderProcurementLoadCached('wb', () => orderProcurementFetchJson(['data/order_procurement_wb.json', 'data/order_procurement_wb.json.gz']));
      }
      if (normalizedPlatform === 'ozon' && !ORDER_PROCUREMENT_RUNTIME.cache.ozon) {
        await orderProcurementLoadCached('ozon', () => orderProcurementFetchJson(['data/order_procurement_ozon.json', 'data/order_procurement_ozon.json.gz']));
      }
      if (normalizedPlatform === 'ym' && !ORDER_PROCUREMENT_RUNTIME.cache.ym) {
        await orderProcurementLoadCached('ym', () => orderProcurementFetchJson(['data/order_procurement_ym.json', 'data/order_procurement_ym.json.gz']));
      }
      if (!ORDER_PROCUREMENT_RUNTIME.cache.wb && !ORDER_PROCUREMENT_RUNTIME.cache.ozon && !ORDER_PROCUREMENT_RUNTIME.cache.ym) {
        throw combinedError;
      }
    }
  }

  if (!hasPlatformRows(ORDER_PROCUREMENT_RUNTIME.cache.combined, normalizedPlatform)) {
    const cacheKey = normalizedPlatform === 'ozon' ? 'ozon' : (normalizedPlatform === 'ym' ? 'ym' : 'wb');
    const paths = normalizedPlatform === 'ozon'
      ? ['data/order_procurement_ozon.json', 'data/order_procurement_ozon.json.gz']
      : (normalizedPlatform === 'ym'
        ? ['data/order_procurement_ym.json', 'data/order_procurement_ym.json.gz']
        : ['data/order_procurement_wb.json', 'data/order_procurement_wb.json.gz']);
    if (!ORDER_PROCUREMENT_RUNTIME.cache[cacheKey]) {
      await orderProcurementLoadCached(cacheKey, () => orderProcurementFetchJson(paths));
    }
  }
}

function orderProcurementCurrentPayload(platform) {
  orderProcurementPrimeCacheFromState();
  if (ORDER_PROCUREMENT_RUNTIME.cache.combined && Array.isArray(ORDER_PROCUREMENT_RUNTIME.cache.combined.rows)) {
    const target = platform === 'ozon' || platform === 'ym' ? platform : 'wb';
    const platformPayload = target === 'ozon'
      ? ORDER_PROCUREMENT_RUNTIME.cache.ozon
      : (target === 'ym' ? ORDER_PROCUREMENT_RUNTIME.cache.ym : ORDER_PROCUREMENT_RUNTIME.cache.wb);
    const combinedRows = ORDER_PROCUREMENT_RUNTIME.cache.combined.rows.filter((row) => orderProcurementNormalizeKey(row?.platform) === target);
    if (!combinedRows.length && Array.isArray(platformPayload?.rows) && platformPayload.rows.length) return platformPayload;
    return {
      ...ORDER_PROCUREMENT_RUNTIME.cache.combined,
      platform: target.toUpperCase(),
      rows: combinedRows
    };
  }
  return platform === 'ozon'
    ? ORDER_PROCUREMENT_RUNTIME.cache.ozon
    : (platform === 'ym' ? ORDER_PROCUREMENT_RUNTIME.cache.ym : ORDER_PROCUREMENT_RUNTIME.cache.wb);
}

function orderProcurementHasReadyData() {
  const platform = ensureOrderProcurementState().platform;
  const payload = orderProcurementCurrentPayload(platform);
  const hasRows = Array.isArray(payload?.rows) && payload.rows.length > 0;
  const hasSkus =
    (Array.isArray(state.skus) && state.skus.length > 0) ||
    (Array.isArray(ORDER_PROCUREMENT_RUNTIME.cache.skus) && ORDER_PROCUREMENT_RUNTIME.cache.skus.length > 0);
  return hasRows && hasSkus;
}

function orderProcurementBuildRenderSignature() {
  const orderState = ensureOrderProcurementState();
  const payload = orderProcurementCurrentPayload(orderState.platform) || {};
  const payloadRows = Array.isArray(payload.rows) ? payload.rows.length : 0;
  const payloadStamp = String(payload.generatedAt || payload.updatedAt || payload.asOfDate || payload.window?.to || '');
  const warehouseStamp = String(ORDER_PROCUREMENT_RUNTIME.cache.warehouse?.generatedAt || '');
  const skuCount = Array.isArray(state.skus) && state.skus.length
    ? state.skus.length
    : (Array.isArray(ORDER_PROCUREMENT_RUNTIME.cache.skus) ? ORDER_PROCUREMENT_RUNTIME.cache.skus.length : 0);
  const comments = Array.isArray(state.storage?.comments) ? state.storage.comments : [];
  const commentCount = comments.length;
  const newestCommentId = String(comments[0]?.id || comments[0]?.createdAt || '');
  return [
    orderState.platform,
    orderState.days,
    orderState.search || '',
    orderState.place || 'all',
    (orderState.placeSelection || []).join('~'),
    orderState.clusterFilter || 'all',
    orderState.clusterDays || 30,
    orderState.mode || 'all',
    orderState.sort || 'recommended_desc',
    payloadRows,
    payloadStamp,
    warehouseStamp,
    skuCount,
    commentCount,
    newestCommentId
  ].join('|');
}

function orderProcurementBuildSkuLookup() {
  const rows = Array.isArray(state.skus) && state.skus.length
    ? state.skus
    : (Array.isArray(ORDER_PROCUREMENT_RUNTIME.cache.skus) ? ORDER_PROCUREMENT_RUNTIME.cache.skus : []);
  const lookup = new Map();

  rows.forEach((row) => {
    orderProcurementUnique([
      orderProcurementNormalizeKey(row?.articleKey),
      orderProcurementNormalizeKey(row?.article),
      orderProcurementNormalizeKey(row?.sku)
    ]).forEach((key) => {
      if (key && !lookup.has(key)) lookup.set(key, row);
    });
  });

  return lookup;
}

function orderProcurementBuildWarehouseMap() {
  const rows = Array.isArray(ORDER_PROCUREMENT_RUNTIME.cache.warehouse?.rows) ? ORDER_PROCUREMENT_RUNTIME.cache.warehouse.rows : [];
  const lookup = new Map();

  rows.forEach((row) => {
    const key = orderProcurementNormalizeKey(row?.articleKey || row?.article);
    if (!key) return;
    const hasInboundWarehouse = ['inboundWarehouse', 'inbound', 'warehouseInbound', 'inTransitWarehouse', 'inboundUnits']
      .some((field) => row?.[field] !== undefined && row?.[field] !== null && String(row[field]).trim() !== '');
    lookup.set(key, {
      stockWarehouse: orderProcurementNumber(row?.stockWarehouse),
      inboundWarehouse: typeof orderProcurementReadWarehouseInbound === 'function'
        ? orderProcurementReadWarehouseInbound(row)
        : 0,
      hasInboundWarehouse,
      accepted: orderProcurementNumber(row?.accepted),
      shippedWB: orderProcurementNumber(row?.shippedWB),
      shippedOzon: orderProcurementNumber(row?.shippedOzon)
    });
  });

  return lookup;
}
