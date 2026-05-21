(function () {
  if (window.__ALTEA_CONTROL_DIRECTION_COUNTS_20260521__) return;
  window.__ALTEA_CONTROL_DIRECTION_COUNTS_20260521__ = true;

  const TARGETS = ['wb', 'ozon', 'ya', 'goldapple', 'letu', 'magnit'];
  const RETAIL = ['ya', 'goldapple', 'letu', 'magnit'];

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
    return (keys || []).filter((key) => TARGETS.includes(key)).filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function retailKeys(value) {
    const raw = lower(value);
    const flat = compact(raw);
    const keys = [];
    if (raw.includes('яндекс') || raw.includes('я.маркет') || flat.includes('ямаркет') || flat === 'ям' || flat === 'ya' || flat === 'ym' || flat.includes('yandex')) keys.push('ya');
    if (raw.includes('золот') || flat.includes('зя') || flat.includes('gold') || flat.includes('zya')) keys.push('goldapple');
    if (flat.includes('лету') || flat.includes('лэту') || flat.includes('letu') || flat.includes('letoile') || flat.includes('letoil')) keys.push('letu');
    if (flat.includes('магнит') || flat.includes('magnit') || flat.includes('magnet')) keys.push('magnit');
    return unique(keys);
  }

  function explicitPlatformKeys(task) {
    const value = task?.platform || task?.marketplace || task?.marketplaceKey || task?.network || task?.retailer || task?.channel || task?.market;
    const raw = lower(value);
    const flat = compact(raw);
    if (!raw || raw === 'all') return retailKeys([task?.entityLabel, task?.title].filter(Boolean).join(' '));
    if (['wb+ozon', 'wb + ozon', 'wb/ozon', 'wb,ozon', 'wb ozon', 'wildberries+ozon'].includes(raw)
      || ['wbozon', 'wildberriesozon', 'вбозон'].includes(flat)) return ['wb', 'ozon'];
    if (['wb', 'wildberries', 'вб'].includes(flat)) return ['wb'];
    if (['ozon', 'озон'].includes(flat)) return ['ozon'];
    if (['retail', 'retails', 'сети', 'розница'].includes(flat)) return RETAIL;
    return retailKeys(raw);
  }

  function allTasks() {
    try {
      if (typeof getControlSnapshot === 'function') {
        const snapshot = getControlSnapshot();
        if (Array.isArray(snapshot?.tasks)) return snapshot.tasks;
        if (Array.isArray(snapshot?.active)) return snapshot.active;
      }
    } catch {}
    try {
      if (typeof getAllTasks === 'function') return getAllTasks();
    } catch {}
    return Array.isArray(window.state?.storage?.tasks) ? window.state.storage.tasks : [];
  }

  function fmtInt(value) {
    try {
      return Number(value || 0).toLocaleString('ru-RU');
    } catch {
      return String(value || 0);
    }
  }

  function refreshCounters() {
    const buttons = Array.from(document.querySelectorAll('button.control-simple-direction[data-platform]'));
    if (!buttons.length) return;
    const counts = Object.fromEntries(TARGETS.map((key) => [key, 0]));
    allTasks().forEach((task) => {
      if (lower(task?.status) === 'cancelled') return;
      explicitPlatformKeys(task).forEach((key) => {
        counts[key] = (counts[key] || 0) + 1;
      });
    });
    buttons.forEach((button) => {
      const key = lower(button.getAttribute('data-platform'));
      if (!TARGETS.includes(key)) return;
      const target = button.querySelector('b');
      const value = fmtInt(counts[key]);
      if (target && target.textContent !== value) target.textContent = value;
    });
    window.__alteaControlDirectionCounts = counts;
  }

  let scheduled = false;
  function scheduleRefresh() {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      refreshCounters();
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run);
    else window.setTimeout(run, 0);
  }

  function startObserver() {
    if (!document.body || window.__alteaControlDirectionCountObserver) return;
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.addedNodes.length || mutation.removedNodes.length)) scheduleRefresh();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.__alteaControlDirectionCountObserver = observer;
  }

  if (document.body) startObserver();
  else document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  document.addEventListener('click', (event) => {
    if (event.target.closest && event.target.closest('[data-control-simple-direction], .control-simple-direction')) {
      window.setTimeout(scheduleRefresh, 80);
      window.setTimeout(scheduleRefresh, 600);
    }
  }, true);
  [0, 120, 600, 1500, 3500].forEach((delay) => window.setTimeout(scheduleRefresh, delay));
})();
