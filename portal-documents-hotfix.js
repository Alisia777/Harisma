(function () {
  if (window.__ALTEA_DOCUMENTS_HOTFIX_20260425A__) return;
  window.__ALTEA_DOCUMENTS_HOTFIX_20260425A__ = true;

  function renderDocumentsFixed() {
    const root = document.getElementById('view-documents');
    if (!root) return;

    const groups = state.documents?.groups || [];
    const filteredGroups = typeof getDocumentGroupsFiltered === 'function' ? getDocumentGroupsFiltered() : groups;
    const totalDocs = groups.reduce((acc, group) => acc + (group.items || []).length, 0);

    root.innerHTML = `
      <div class="section-title">
        <div>
          <h2>База инструкций</h2>
          <p>Здесь лежат не рабочие выгрузки, а короткие инструкции по тому, как пользоваться вкладками портала и как читать их данные.</p>
        </div>
        <div class="badge-stack">${badge(`${fmt.int(totalDocs)} инструкций`, 'ok')}${badge('how-to по вкладкам', 'info')}</div>
      </div>

      <div class="banner">
        <div>i</div>
        <div><strong>Раздел очищен от старой файловой витрины.</strong> Теперь здесь только пользовательские инструкции: как работать с репрайсером, дашбордом, задачником, ценами и остальными вкладками.</div>
      </div>

      <div class="filters docs-filters">
        <input id="docSearchInput" placeholder="Поиск по названию инструкции, вкладке или сценарию…" value="${escapeHtml(state.docFilters.search)}">
        <select id="docGroupFilter">
          <option value="all">Все группы</option>
          ${groups.map((group) => `<option value="${escapeHtml(group.title)}" ${state.docFilters.group === group.title ? 'selected' : ''}>${escapeHtml(group.title)}</option>`).join('')}
        </select>
      </div>

      <div class="doc-groups">
        ${filteredGroups.map((group) => `
          <div class="card">
            <div class="section-subhead">
              <div>
                <h3>${escapeHtml(group.title)}</h3>
                <p class="small muted">Открываются локальные markdown-инструкции по работе с порталом.</p>
              </div>
              ${badge(`${fmt.int(group.items.length)} шт.`)}
            </div>
            <div class="doc-grid">
              ${group.items.map((item) => `
                <a class="doc-card" href="${escapeHtml(item.href)}" target="_blank" rel="noopener">
                  <div class="doc-top"><span class="doc-type">${escapeHtml(item.type)}</span><span class="muted small">${escapeHtml(String(item.sizeMb || '0'))} MB</span></div>
                  <strong>${escapeHtml(item.title)}</strong>
                  <p>${escapeHtml(item.description || 'Рабочая инструкция')}</p>
                  <span class="doc-action">Открыть инструкцию →</span>
                </a>
              `).join('')}
            </div>
          </div>
        `).join('') || '<div class="empty">По текущим фильтрам инструкции не найдены.</div>'}
      </div>
    `;

    document.getElementById('docSearchInput')?.addEventListener('input', (event) => {
      state.docFilters.search = event.target.value;
      renderDocumentsFixed();
    });
    document.getElementById('docGroupFilter')?.addEventListener('change', (event) => {
      state.docFilters.group = event.target.value;
      renderDocumentsFixed();
    });
  }

  window.renderDocuments = renderDocumentsFixed;
  try { renderDocuments = renderDocumentsFixed; } catch {}

  if (document.getElementById('view-documents')?.classList.contains('active')) {
    window.setTimeout(renderDocumentsFixed, 0);
  }
})();
