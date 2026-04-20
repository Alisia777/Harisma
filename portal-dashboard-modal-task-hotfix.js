(function () {
  if (window.__ALTEA_DASHBOARD_MODAL_TASK_HOTFIX_20260420A__) return;
  window.__ALTEA_DASHBOARD_MODAL_TASK_HOTFIX_20260420A__ = true;

  const STYLE_ID = 'portalDashboardModalTaskHotfixStyles20260420a';
  const TEXT = {
    panelTitle: 'Поставить задачу из этого окна',
    panelBody: 'Выберите SKU, заполните что сделать, назначьте owner и срок. Задача сразу появится во вкладке «Задачи».',
    sku: 'SKU',
    owner: 'Owner',
    due: 'Срок',
    priority: 'Приоритет',
    title: 'Что за задача',
    nextAction: 'Что сделать / комментарий',
    ownerPlaceholder: 'Кто отвечает',
    titlePlaceholder: 'Например: Разобрать цену по SKU',
    nextActionPlaceholder: 'Какой следующий шаг нужен по позиции',
    submit: 'Поставить задачу',
    openTasks: 'Открыть задачник',
    ready: 'После создания задача появится во вкладке «Задачи».',
    createdPrefix: 'Задача по ',
    createdSuffix: ' создана.',
    validation: 'Заполните артикул, название задачи и следующий шаг.',
    failed: 'Не удалось создать задачу. Попробуйте ещё раз.',
    pick: 'Поставить задачу',
    low: 'Низкий',
    medium: 'Средний',
    high: 'Высокий',
    critical: 'Критично'
  };

  function esc(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value);
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function appState() {
    return typeof window.state === 'object' && window.state ? window.state : null;
  }

  function iso(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function plusDaysIso(days) {
    if (typeof window.plusDays === 'function') return window.plusDays(days);
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + Number(days || 0));
    return iso(date);
  }

  function ownerOptions() {
    if (typeof window.ownerOptions === 'function') {
      const rows = window.ownerOptions();
      if (Array.isArray(rows) && rows.length) return rows.filter(Boolean);
    }
    const skus = Array.isArray(appState()?.skus) ? appState().skus : [];
    return Array.from(new Set(skus
      .map((sku) => String(sku?.owner || sku?.ownerName || sku?.manager || '').trim())
      .filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, 'ru'));
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      body > .portal-exec-modal .portal-exec-task-panel { margin-top: 14px; }
      body > .portal-exec-modal .portal-exec-task-panel .portal-exec-modal-card { padding: 16px; }
      body > .portal-exec-modal .portal-exec-modal-task-copy { display: grid; gap: 8px; margin-bottom: 12px; }
      body > .portal-exec-modal .portal-exec-modal-task-copy strong { color: #f6ead4; font-size: 18px; }
      body > .portal-exec-modal .portal-exec-modal-task-copy p { margin: 0; color: rgba(245,232,207,.72); line-height: 1.5; }
      body > .portal-exec-modal .portal-exec-task-grid { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
      body > .portal-exec-modal .portal-exec-task-grid label { display: grid; gap: 6px; min-width: 0; }
      body > .portal-exec-modal .portal-exec-task-grid label.wide { grid-column: 1 / -1; }
      body > .portal-exec-modal .portal-exec-task-grid span { color: rgba(245,232,207,.72); font-size: 12px; }
      body > .portal-exec-modal .portal-exec-task-grid input,
      body > .portal-exec-modal .portal-exec-task-grid select,
      body > .portal-exec-modal .portal-exec-task-grid textarea {
        width: 100%;
        min-width: 0;
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(212,164,74,.18);
        background: rgba(17,14,11,.96);
        color: #f6ead4;
        font: inherit;
        box-sizing: border-box;
      }
      body > .portal-exec-modal .portal-exec-task-grid textarea { min-height: 96px; resize: vertical; }
      body > .portal-exec-modal .portal-exec-task-grid input:focus,
      body > .portal-exec-modal .portal-exec-task-grid select:focus,
      body > .portal-exec-modal .portal-exec-task-grid textarea:focus {
        outline: none;
        border-color: rgba(236,203,123,.88);
        box-shadow: 0 0 0 3px rgba(212,164,74,.12);
      }
      body > .portal-exec-modal .portal-exec-task-actions {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
        margin-top: 14px;
      }
      body > .portal-exec-modal .portal-exec-task-actions .portal-exec-chip-stack { display: flex; gap: 8px; flex-wrap: wrap; }
      body > .portal-exec-modal .portal-exec-task-status { color: rgba(245,232,207,.68); font-size: 12px; }
      body > .portal-exec-modal .portal-exec-task-status.is-success { color: #9fdfab; }
      body > .portal-exec-modal .portal-exec-task-status.is-error { color: #ff9a8a; }
      body > .portal-exec-modal .portal-exec-issue-row .quick-chip { margin-top: 10px; }
      @media (max-width: 900px) {
        body > .portal-exec-modal .portal-exec-task-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 720px) {
        body > .portal-exec-modal .portal-exec-task-grid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function modalPlatformKey(value) {
    const raw = String(value || '').toLowerCase();
    if (/(^|\W)wb($|\W)|wildberries/.test(raw)) return 'wb';
    if (/ozon/.test(raw)) return 'ozon';
    if (/ям|сет|яндекс|market|retail/.test(raw)) return 'retail';
    return 'all';
  }

  function openControlView(platformKey) {
    const app = appState();
    if (app) {
      app.controlFilters = app.controlFilters || {};
      app.controlFilters.platform = platformKey === 'retail' ? 'retail' : platformKey === 'wb' || platformKey === 'ozon' ? platformKey : 'all';
      app.controlFilters.source = 'all';
      app.controlFilters.status = 'active';
      app.controlFilters.type = 'all';
      app.controlFilters.horizon = 'all';
      app.controlFilters.owner = 'all';
      app.controlFilters.search = '';
      app.controlFilters.priority = 'all';
    }
    if (typeof window.setView === 'function') {
      window.setView('control');
      return;
    }
    document.querySelector('.nav-btn[data-view="control"]')?.click();
  }

  function modalTitle(modal) {
    return modal?.querySelector('#portalDashboardExecutiveModalTitle')?.textContent?.trim()
      || modal?.querySelector('h2')?.textContent?.trim()
      || modal?.querySelector('h3')?.textContent?.trim()
      || '';
  }

  function presetFromTitle(title) {
    const raw = String(title || '').toLowerCase();
    const platformKey = modalPlatformKey(title);
    if (/риск/.test(raw)) return { label: title, platformKey, priority: 'critical', type: 'price_margin', titlePrefix: 'Разобрать риск по SKU ', nextPrefix: 'Проверить риск и причину по SKU ' };
    if (/план|выполн/.test(raw)) return { label: title, platformKey, priority: 'high', type: 'assignment', titlePrefix: 'Разобрать выполнение плана по SKU ', nextPrefix: 'Проверить план / факт и согласовать шаг по SKU ' };
    if (/цен|чек/.test(raw)) return { label: title, platformKey, priority: 'high', type: 'price_margin', titlePrefix: 'Разобрать цену по SKU ', nextPrefix: 'Проверить цену, чек и решение по SKU ' };
    if (/марж/.test(raw)) return { label: title, platformKey, priority: 'critical', type: 'price_margin', titlePrefix: 'Разобрать маржу по SKU ', nextPrefix: 'Проверить маржу и коридор цены по SKU ' };
    if (/оборач|остат|запас/.test(raw)) return { label: title, platformKey, priority: 'high', type: 'supply', titlePrefix: 'Разобрать оборачиваемость по SKU ', nextPrefix: 'Проверить оборачиваемость, остаток и поставку по SKU ' };
    return { label: title, platformKey, priority: 'high', type: 'assignment', titlePrefix: 'Разобрать SKU ', nextPrefix: 'Проверить SKU ' };
  }

  function uniqueRows(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      if (!row || seen.has(row.articleKey)) return false;
      seen.add(row.articleKey);
      return true;
    });
  }

  function tableRows(modal, preset) {
    return Array.from(modal.querySelectorAll('table')).flatMap((table) => {
      const headers = Array.from(table.querySelectorAll('thead th')).map((node) => String(node.textContent || '').trim().toLowerCase());
      const skuIndex = headers.findIndex((label) => label.includes('sku'));
      if (skuIndex === -1) return [];
      const ownerIndex = headers.findIndex((label) => label.includes('owner'));
      const platformIndex = headers.findIndex((label) => label.includes('площ') || label.includes('platform'));
      return Array.from(table.querySelectorAll('tbody tr')).map((row) => {
        const cells = Array.from(row.children);
        const skuCell = cells[skuIndex];
        const articleKey = String(
          row.dataset.openPriceArticle
          || row.dataset.openSku
          || skuCell?.querySelector('[data-open-sku]')?.dataset.openSku
          || skuCell?.querySelector('button')?.textContent
          || skuCell?.querySelector('strong')?.textContent
          || ''
        ).trim();
        if (!articleKey) return null;
        const ownerCell = ownerIndex >= 0 ? cells[ownerIndex] : null;
        const owner = ownerCell
          ? String(ownerCell.querySelector('strong')?.textContent || ownerCell.textContent || '').trim().split('\n')[0].trim()
          : '';
        const name = String(
          skuCell?.querySelector('.muted.small')?.textContent
          || cells[skuIndex + 1]?.querySelector('strong')?.textContent
          || ''
        ).trim();
        const platformRaw = String(
          row.dataset.openPriceMarket
          || (platformIndex >= 0 ? cells[platformIndex]?.textContent || '' : '')
          || preset.platformKey
          || ''
        ).trim();
        return {
          articleKey,
          label: articleKey + (name ? ` · ${name}` : ''),
          owner,
          platformKey: modalPlatformKey(platformRaw),
          priority: preset.priority,
          type: preset.type,
          title: preset.titlePrefix + articleKey,
          nextAction: `${preset.nextPrefix}${articleKey} в окне «${preset.label}», согласовать решение и зафиксировать следующий шаг.`
        };
      }).filter(Boolean);
    });
  }

  function issueRows(modal, preset) {
    return Array.from(modal.querySelectorAll('.portal-exec-issue-row')).map((row) => {
      const articleKey = String(row.querySelector('.muted.small')?.textContent || '').trim();
      if (!articleKey) return null;
      const name = String(row.querySelector('strong')?.textContent || '').trim();
      const owner = String(row.querySelector('.portal-exec-chip-stack .chip')?.textContent || '').trim();
      const reason = String(row.querySelector('p')?.textContent || '').trim();
      const priority = /10|9|8|отриц|марж/i.test(reason) ? 'critical' : preset.priority;
      const platformKey = modalPlatformKey(`${preset.platformKey} ${reason} ${preset.label}`);
      return {
        articleKey,
        label: articleKey + (name ? ` · ${name}` : ''),
        owner,
        platformKey,
        priority,
        type: preset.type,
        title: preset.titlePrefix + articleKey,
        nextAction: reason || `${preset.nextPrefix}${articleKey} в окне «${preset.label}», согласовать решение и зафиксировать следующий шаг.`
      };
    }).filter(Boolean);
  }

  function appendIssueButtons(modal) {
    modal.querySelectorAll('.portal-exec-issue-row').forEach((row) => {
      if (row.querySelector('[data-portal-task-pick]')) return;
      const articleKey = String(row.querySelector('.muted.small')?.textContent || '').trim();
      const paragraph = row.querySelector('p');
      if (!articleKey || !paragraph) return;
      paragraph.insertAdjacentHTML('afterend', `<button type="button" class="quick-chip" data-portal-task-pick="${esc(articleKey)}">${esc(TEXT.pick)}</button>`);
    });
  }

  function renderPanel(rows) {
    if (!rows.length) return '';
    const first = rows[0];
    const owners = ownerOptions();
    const priorities = { low: TEXT.low, medium: TEXT.medium, high: TEXT.high, critical: TEXT.critical };
    return `
      <section class="portal-exec-task-panel">
        <div class="portal-exec-modal-card">
          <div class="portal-exec-modal-task-copy">
            <strong>${esc(TEXT.panelTitle)}</strong>
            <p>${esc(TEXT.panelBody)}</p>
          </div>
          <form data-portal-task-form="1">
            <div class="portal-exec-task-grid">
              <label>
                <span>${esc(TEXT.sku)}</span>
                <select name="articleKey">
                  ${rows.map((row) => `<option value="${esc(row.articleKey)}">${esc(row.label)}</option>`).join('')}
                </select>
              </label>
              <label>
                <span>${esc(TEXT.owner)}</span>
                <input name="owner" list="portalExecModalOwners" value="${esc(first.owner || '')}" placeholder="${esc(TEXT.ownerPlaceholder)}">
              </label>
              <label>
                <span>${esc(TEXT.due)}</span>
                <input type="date" name="due" value="${esc(plusDaysIso(3))}">
              </label>
              <label>
                <span>${esc(TEXT.priority)}</span>
                <select name="priority">
                  ${Object.entries(priorities).map(([key, label]) => `<option value="${key}" ${first.priority === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}
                </select>
              </label>
              <label class="wide">
                <span>${esc(TEXT.title)}</span>
                <input name="title" value="${esc(first.title)}" placeholder="${esc(TEXT.titlePlaceholder)}">
              </label>
              <label class="wide">
                <span>${esc(TEXT.nextAction)}</span>
                <textarea name="nextAction" placeholder="${esc(TEXT.nextActionPlaceholder)}">${esc(first.nextAction)}</textarea>
              </label>
            </div>
            <div class="portal-exec-task-actions">
              <div class="portal-exec-chip-stack">
                <button type="submit" class="btn">${esc(TEXT.submit)}</button>
                <button type="button" class="btn ghost" data-portal-task-open-control="1">${esc(TEXT.openTasks)}</button>
              </div>
              <div class="portal-exec-task-status" data-portal-task-status>${esc(TEXT.ready)}</div>
            </div>
            <datalist id="portalExecModalOwners">${owners.map((name) => `<option value="${esc(name)}"></option>`).join('')}</datalist>
          </form>
        </div>
      </section>
    `;
  }

  function bindPanel(modal, rows) {
    const form = modal.querySelector('[data-portal-task-form]');
    if (!form || form.dataset.portalTaskBound === '1') return;
    form.dataset.portalTaskBound = '1';
    const rowMap = new Map(rows.map((row) => [row.articleKey, row]));
    const statusNode = form.querySelector('[data-portal-task-status]');

    function setStatus(kind, text) {
      if (!statusNode) return;
      statusNode.className = `portal-exec-task-status${kind ? ` is-${kind}` : ''}`;
      statusNode.textContent = text;
    }

    function syncSelected(articleKey) {
      const row = rowMap.get(articleKey);
      if (!row) return;
      form.elements.owner.value = row.owner || '';
      form.elements.title.value = row.title || '';
      form.elements.nextAction.value = row.nextAction || '';
      form.elements.priority.value = row.priority || 'high';
    }

    form.elements.articleKey?.addEventListener('change', (event) => syncSelected(event.target.value));
    modal.querySelectorAll('[data-portal-task-pick]').forEach((button) => {
      button.addEventListener('click', () => {
        const articleKey = button.dataset.portalTaskPick;
        if (!articleKey || !rowMap.has(articleKey)) return;
        form.elements.articleKey.value = articleKey;
        syncSelected(articleKey);
        form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    });
    form.querySelector('[data-portal-task-open-control]')?.addEventListener('click', () => {
      const row = rowMap.get(form.elements.articleKey.value);
      openControlView(row?.platformKey || 'all');
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const articleKey = String(form.elements.articleKey.value || '').trim();
      const title = String(form.elements.title.value || '').trim();
      const nextAction = String(form.elements.nextAction.value || '').trim();
      if (!articleKey || !title || !nextAction) {
        setStatus('error', TEXT.validation);
        return;
      }
      if (typeof window.createManualTask !== 'function') {
        setStatus('error', TEXT.failed);
        return;
      }
      const row = rowMap.get(articleKey);
      const submitButton = form.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      try {
        await window.createManualTask({
          articleKey,
          title,
          nextAction,
          owner: String(form.elements.owner.value || '').trim(),
          due: form.elements.due.value,
          priority: form.elements.priority.value,
          type: row?.type || 'price_margin',
          platform: row?.platformKey || ''
        });
        if (typeof window.updateSyncBadge === 'function') window.updateSyncBadge();
        if (typeof window.rerenderCurrentView === 'function') window.rerenderCurrentView();
        setStatus('success', `${TEXT.createdPrefix}${articleKey}${TEXT.createdSuffix}`);
      } catch (error) {
        console.error(error);
        setStatus('error', TEXT.failed);
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  function enhanceModal() {
    const modal = document.querySelector('body > .portal-exec-modal');
    if (!modal) return;
    const body = modal.querySelector('#portalDashboardExecutiveModalBody') || modal.querySelector('.portal-exec-modal-card');
    if (!body) return;
    const preset = presetFromTitle(modalTitle(modal));
    const signature = [preset.label, modal.querySelectorAll('table tbody tr').length, modal.querySelectorAll('.portal-exec-issue-row').length].join('|');
    if (modal.dataset.portalTaskSignature === signature && modal.querySelector('[data-portal-task-form]')) return;
    modal.querySelector('.portal-exec-task-panel')?.remove();
    modal.querySelectorAll('[data-portal-task-pick]').forEach((button) => button.remove());
    appendIssueButtons(modal);
    const rows = uniqueRows([...issueRows(modal, preset), ...tableRows(modal, preset)]);
    if (!rows.length) return;
    body.insertAdjacentHTML('beforeend', renderPanel(rows));
    bindPanel(modal, rows);
    modal.dataset.portalTaskSignature = signature;
  }

  function observe() {
    if (document.body?.dataset.portalDashboardModalTaskObserver === '1') return;
    if (document.body) document.body.dataset.portalDashboardModalTaskObserver = '1';
    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(enhanceModal);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    [0, 200, 800].forEach((delay) => window.setTimeout(enhanceModal, delay));
  }

  function start() {
    ensureStyles();
    observe();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(start, 80), { once: true });
  } else {
    window.setTimeout(start, 80);
  }

  window.addEventListener('load', () => window.setTimeout(start, 120), { once: true });
})();
