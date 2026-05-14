(function () {
  if (window.__ALTEA_OWNER_ASSIGNMENT_HOTFIX_20260514__) return;
  window.__ALTEA_OWNER_ASSIGNMENT_HOTFIX_20260514__ = true;

  function normalizedOwnerInput(value) {
    if (typeof normalizeOwnerToken === 'function') return normalizeOwnerToken(value);
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  if (typeof canonicalOwnerName === 'function') {
    const originalCanonicalOwnerName = canonicalOwnerName;
    const patchedCanonicalOwnerName = function patchedCanonicalOwnerName(value = '') {
      const normalized = normalizedOwnerInput(value);
      const lowered = normalized.toLowerCase();
      if (lowered === 'артем' || lowered === 'артём' || lowered === 'артем сергеевич' || lowered === 'артём сергеевич') return 'Артем';
      return originalCanonicalOwnerName(value);
    };
    window.canonicalOwnerName = patchedCanonicalOwnerName;
    try {
      canonicalOwnerName = patchedCanonicalOwnerName;
    } catch (error) {
      console.warn('[portal-owner-assignment-hotfix] canonical bind', error);
    }
  }

  async function patchedRemoveOwnerAssignment(articleKey) {
    const normalizedArticleKey = String(articleKey || '').trim();
    if (!normalizedArticleKey || typeof state !== 'object' || !state) return;
    const clearedOverride = typeof normalizeOwnerOverride === 'function'
      ? normalizeOwnerOverride({
        articleKey: normalizedArticleKey,
        ownerName: '',
        ownerRole: '',
        note: '',
        updatedAt: new Date().toISOString(),
        assignedBy: state.team?.member?.name || 'Команда'
      })
      : {
        articleKey: normalizedArticleKey,
        ownerName: '',
        ownerRole: '',
        note: '',
        updatedAt: new Date().toISOString(),
        assignedBy: state.team?.member?.name || 'Команда'
      };

    state.storage = state.storage || {};
    state.storage.ownerOverrides = (state.storage.ownerOverrides || [])
      .filter((item) => item.articleKey !== normalizedArticleKey);
    state.storage.ownerOverrides.unshift(clearedOverride);
    if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
    if (typeof saveLocalStorage === 'function') saveLocalStorage();
    try {
      if (typeof persistOwnerOverride === 'function') await persistOwnerOverride(clearedOverride);
    } catch (error) {
      console.error('[portal-owner-assignment-hotfix] persist cleared owner', error);
    }
  }

  window.removeOwnerAssignment = patchedRemoveOwnerAssignment;
  try {
    removeOwnerAssignment = patchedRemoveOwnerAssignment;
  } catch (error) {
    console.warn('[portal-owner-assignment-hotfix] remove bind', error);
  }

  function refreshOwnerState() {
    try {
      if (typeof applyOwnerOverridesToSkus === 'function') applyOwnerOverridesToSkus();
      if (typeof rerenderCurrentView === 'function') rerenderCurrentView();
      if (typeof state === 'object' && state?.activeSku && typeof renderSkuModal === 'function') renderSkuModal(state.activeSku);
    } catch (error) {
      console.warn('[portal-owner-assignment-hotfix] refresh', error);
    }
  }

  window.setTimeout(refreshOwnerState, 0);
  window.setTimeout(refreshOwnerState, 1200);
})();
