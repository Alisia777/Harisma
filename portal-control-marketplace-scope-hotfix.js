(function () {
  if (window.__ALTEA_CONTROL_MARKETPLACE_SCOPE_20260521__) return;
  window.__ALTEA_CONTROL_MARKETPLACE_SCOPE_20260521__ = true;

  const SINGLE = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'megamarket', 'samokat', 'magnit', 'product', 'cross'];
  const RETAIL = ['ya', 'goldapple', 'letu', 'megamarket', 'samokat', 'magnit'];
  const baseControlWorkstreamKey = typeof controlWorkstreamKey === 'function'
    ? controlWorkstreamKey
    : (typeof window.controlWorkstreamKey === 'function' ? window.controlWorkstreamKey : null);

  function lower(value) {
    return String(value || '').trim().toLowerCase();
  }

  function compact(value) {
    return lower(value)
      .replaceAll(' ', '')
      .replaceAll('.', '')
      .replaceAll('_', '')
      .replaceAll("'", '')
      .replaceAll('"', '')
      .replaceAll('`', '')
      .replaceAll('’', '')
      .replaceAll('+', '')
      .replaceAll('-', '')
      .replaceAll('/', '');
  }

  function unique(keys) {
    const seen = new Set();
    return (keys || []).filter((key) => SINGLE.includes(key)).filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function retailKeys(value) {
    const raw = lower(value);
    const flat = compact(raw);
    const keys = [];
    if (raw.includes('яндекс') || raw.includes('я.маркет') || flat.includes('ямаркет') || flat === 'ям' || flat === 'ya' || flat === 'ym' || flat.includes('yandex')
      || /(^|[^a-zа-я0-9])(ya|ym|ям)(?=$|[^a-zа-я0-9])/i.test(raw)) keys.push('ya');
    if (raw.includes('золот') || flat === 'зя' || flat.includes('gold') || flat === 'zya') keys.push('goldapple');
    if (flat.includes('лету') || flat.includes('лэту') || flat.includes('letu') || flat.includes('letoile') || flat.includes('letoil')) keys.push('letu');
    if (flat.includes('мегамаркет') || flat.includes('megamarket') || flat.includes('sbermegamarket')) keys.push('megamarket');
    if (flat.includes('самокат') || flat.includes('samokat')) keys.push('samokat');
    if (flat.includes('магнит') || flat.includes('magnit') || flat.includes('magnet')) keys.push('magnit');
    return unique(keys);
  }

  function textPlatformKeys(value) {
    const raw = lower(value);
    const keys = [];
    if (/(^|[^a-zа-я0-9])wb(?=$|[^a-zа-я0-9])|wildberries|(^|[^а-я0-9])вб(?=$|[^а-я0-9])/i.test(raw)) keys.push('wb');
    if (/ozon|озон/.test(raw)) keys.push('ozon');
    retailKeys(raw).forEach((key) => keys.push(key));
    if (/продукт|новин|launch|ксюш/.test(raw)) keys.push('product');
    return unique(keys);
  }

  function explicitKeys(value) {
    const raw = lower(value);
    const flat = compact(raw);
    if (!raw || raw === 'all') return [];
    if (['wb+ozon', 'wb + ozon', 'wb/ozon', 'wb,ozon', 'wb ozon', 'wildberries+ozon'].includes(raw)
      || ['wbozon', 'wildberriesozon', 'вбозон'].includes(flat)) return ['wb', 'ozon'];
    if (['wb', 'wildberries', 'вб'].includes(flat)) return ['wb'];
    if (['ozon', 'озон'].includes(flat)) return ['ozon'];
    const retail = retailKeys(raw);
    if (retail.length) return retail;
    if (['retail', 'retails', 'сети', 'розница'].includes(flat)) return RETAIL;
    if (['product', 'products', 'launch', 'launches', 'новинки', 'продукт'].includes(flat)) return ['product'];
    if (['cross', 'common', 'general', 'shared', 'общий', 'общие'].includes(flat)) return ['cross'];
    return [];
  }

  function contextText(task, sku) {
    return [
      task?.marketplace, task?.marketplaceKey, task?.network, task?.retailer, task?.channel, task?.market,
      task?.entityLabel, task?.title, task?.nextAction, task?.reason, task?.articleKey,
      sku?.platform, sku?.marketplace, sku?.marketplaceKey, sku?.name, sku?.articleKey
    ].filter(Boolean).join(' ');
  }

  function correctedGoldapplePlatform(task, sku) {
    const direct = explicitKeys(task?.platform);
    if (direct.length !== 1 || direct[0] !== 'goldapple') return '';

    const titleKeys = textPlatformKeys([task?.title, task?.name, task?.subject, task?.articleKey].filter(Boolean).join(' '))
      .filter((key) => key !== 'goldapple');
    if (titleKeys.length === 1) return titleKeys[0];

    const marker = lower([task?.entityLabel, task?.project, task?.topic].filter(Boolean).join(' '));
    if (/^wb[\s-]/i.test(marker)) return 'wb';
    if (/^oz[\s-]|^ozon[\s-]/i.test(marker)) return 'ozon';
    if (/^mix[\s-]/i.test(marker)) return 'cross';

    const contextKeys = textPlatformKeys([
      task?.marketplace, task?.marketplaceKey, task?.network, task?.retailer, task?.channel, task?.market,
      task?.entityLabel, task?.direction, task?.workstream, task?.queue, task?.project, task?.topic,
      task?.nextAction, task?.reason,
      sku?.platform, sku?.marketplace, sku?.marketplaceKey, sku?.name, sku?.articleKey
    ].filter(Boolean).join(' '));
    const nonGold = contextKeys.filter((key) => key !== 'goldapple');
    if (nonGold.length === 1 && !contextKeys.includes('goldapple')) return nonGold[0];
    if (nonGold.length > 1) return 'cross';
    return '';
  }

  function selectedScope() {
    const filters = (typeof state === 'object' && state && state.controlFilters) ? state.controlFilters : {};
    const role = lower(filters.peopleRole);
    const platform = lower(filters.platform);
    if (SINGLE.includes(role) && role !== 'cross') return role;
    if (SINGLE.includes(platform) && platform !== 'cross') return platform;
    return '';
  }

  function choose(keys) {
    const scope = selectedScope();
    if (scope && keys.includes(scope)) return scope;
    return keys[0] || 'cross';
  }

  function patchedControlWorkstreamKey(task, sku) {
    const correctedGold = correctedGoldapplePlatform(task, sku);
    if (correctedGold) return correctedGold;
    const direct = explicitKeys(task?.platform);
    if (direct.length) return choose(direct);
    const retail = retailKeys(contextText(task, sku));
    if (retail.length) return choose(retail);
    if (baseControlWorkstreamKey) {
      try {
        const baseKeys = explicitKeys(baseControlWorkstreamKey(task, sku));
        if (baseKeys.length) return choose(baseKeys);
      } catch (error) {
        console.warn('[portal-control-marketplace-scope-hotfix]', error);
      }
    }
    return task?.articleKey ? 'product' : 'cross';
  }

  function loadDirectionCounts() {
    const src = 'portal-control-direction-counts-hotfix.js?v=20260619task-noise3';
    const base = src.split('?')[0];
    if (Array.from(document.scripts || []).some((script) => String(script.src || '').includes(base))) return;
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    (document.head || document.body || document.documentElement).appendChild(script);
  }

  window.controlWorkstreamKey = patchedControlWorkstreamKey;
  try { controlWorkstreamKey = patchedControlWorkstreamKey; } catch {}
  loadDirectionCounts();
})();
