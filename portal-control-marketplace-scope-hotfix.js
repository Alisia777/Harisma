(function () {
  if (window.__ALTEA_CONTROL_MARKETPLACE_SCOPE_20260521__) return;
  window.__ALTEA_CONTROL_MARKETPLACE_SCOPE_20260521__ = true;

  const SINGLE = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit', 'product', 'cross'];
  const RETAIL = ['ya', 'goldapple', 'letu', 'magnit'];
  const WB_OZON = ['wb', 'ozon'];
  const baseControlWorkstreamKey = typeof controlWorkstreamKey === 'function'
    ? controlWorkstreamKey
    : (typeof window.controlWorkstreamKey === 'function' ? window.controlWorkstreamKey : null);

  function unique(keys) {
    const seen = new Set();
    return (keys || []).filter((key) => SINGLE.includes(key)).filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function compact(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s._'"`\u2019+\-/\\]+/g, '');
  }

  function inferRetailKeys(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return [];
    const flat = compact(raw);
    const keys = [];
    if (/\u044f\u043d\u0434\u0435\u043a\u0441|\u044f[.\s-]?\u043c\u0430\u0440\u043a\u0435\u0442|yandex|(^|[^a-z0-9])(ya|ym)([^a-z0-9]|$)|(^|[^\u0430-\u044f\u04510-9])\u044f\u043c([^\u0430-\u044f\u04510-9]|$)/.test(raw)) keys.push('ya');
    if (/\u0437\s*\u044f|\u0437\u044f|\u0437\u043e\u043b\u043e\u0442[\u0430-\u044f\u0451\s-]*(\u044f\u0431\u043b\u043e\u043a|\u044f\u0431\u043b)|golden\s*apple|gold[\s_-]*apple|goldapple|zya/.test(raw) || ['goldapple', 'goldenapple', 'zya', '\u0437\u044f', '\u0437\u043e\u043b\u043e\u0442\u043e\u0435\u044f\u0431\u043b\u043e\u043a\u043e'].includes(flat)) keys.push('goldapple');
    if (/\u043b[\s'`\u2019.-]*[\u0435\u044d]\u0442\u0443\u0430\u043b|\u043b\u0435\u0442\u0443\u0430\u043b\u044c?|\u043b\u044d\u0442\u0443\u0430\u043b\u044c?|letual|letu|letoile|l[\s'`.-]*etoile/.test(raw) || ['letu', 'letual', 'letoile', '\u043b\u0435\u0442\u0443\u0430\u043b\u044c', '\u043b\u0435\u0442\u0443\u0430\u043b', '\u043b\u044d\u0442\u0443\u0430\u043b\u044c', '\u043b\u044d\u0442\u0443\u0430\u043b'].includes(flat)) keys.push('letu');
    if (/\u043c\u0430\u0433\u043d\u0438\u0442|magnit|magnet|(^|\W)mm($|\W)/.test(raw) || ['magnit', 'magnitmarket', 'magnet', 'magnetmarket', 'mm', '\u043c\u0430\u0433\u043d\u0438\u0442', '\u043c\u0430\u0433\u043d\u0438\u0442\u043c\u0430\u0440\u043a\u0435\u0442'].includes(flat)) keys.push('magnit');
    return unique(keys);
  }

  function explicitKeys(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return [];
    const flat = compact(raw);
    if (['wb+ozon', 'wb + ozon', 'wb/ozon', 'wb,ozon', 'wb ozon', 'wildberries+ozon'].includes(raw)
      || ['wbozon', 'wildberriesozon', '\u0432\u0431\u043e\u0437\u043e\u043d'].includes(flat)) return WB_OZON;
    if (['wb', 'wildberries', '\u0432\u0431'].includes(flat)) return ['wb'];
    if (['ozon', '\u043e\u0437\u043e\u043d'].includes(flat)) return ['ozon'];
    const retail = inferRetailKeys(raw);
    if (retail.length) return retail;
    if (['retail', 'retails', '\u0441\u0435\u0442\u0438', '\u0440\u043e\u0437\u043d\u0438\u0446\u0430'].includes(flat)) return RETAIL;
    if (['product', 'products', 'launch', 'launches', '\u043d\u043e\u0432\u0438\u043d\u043a\u0438', '\u043f\u0440\u043e\u0434\u0443\u043a\u0442'].includes(flat)) return ['product'];
    if (['cross', 'common', 'general', 'shared', '\u043e\u0431\u0449\u0438\u0439', '\u043e\u0431\u0449\u0438\u0435'].includes(flat)) return ['cross'];
    return [];
  }

  function contextText(task, sku) {
    return [
      task?.marketplace, task?.marketplaceKey, task?.network, task?.retailer, task?.channel, task?.market,
      task?.entityLabel, task?.title, task?.nextAction, task?.reason, task?.articleKey,
      sku?.platform, sku?.marketplace, sku?.marketplaceKey, sku?.name, sku?.articleKey
    ].filter(Boolean).join(' ');
  }

  function selectedScope() {
    const filters = (typeof state === 'object' && state && state.controlFilters) ? state.controlFilters : {};
    const role = String(filters.peopleRole || '').trim().toLowerCase();
    const platform = String(filters.platform || '').trim().toLowerCase();
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
    const direct = explicitKeys(task?.platform);
    if (direct.length) return choose(direct);
    const retail = inferRetailKeys(contextText(task, sku));
    if (retail.length) return choose(retail);
    if (baseControlWorkstreamKey) {
      try {
        const baseKey = String(baseControlWorkstreamKey(task, sku) || '').trim().toLowerCase();
        if (SINGLE.includes(baseKey)) return baseKey;
      } catch (error) {
        console.warn('[portal-control-marketplace-scope-hotfix]', error);
      }
    }
    return task?.articleKey ? 'product' : 'cross';
  }

  window.controlWorkstreamKey = patchedControlWorkstreamKey;
  try { controlWorkstreamKey = patchedControlWorkstreamKey; } catch {}
})();
