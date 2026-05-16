(function portalRepricerAttachmentExport() {
  'use strict';

  var FLAG = '__ALTEA_REPRICER_ATTACHMENT_EXPORT_20260516C__';
  if (window[FLAG]) return;
  window[FLAG] = true;

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function text(value) {
    return String(value == null ? '' : value);
  }

  function escapeHtml(value) {
    return text(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatInt(value) {
    try {
      return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value) || 0);
    } catch (error) {
      return text(Number(value) || 0);
    }
  }

  function rootOf(node) {
    return (node && node.closest && node.closest('#view-repricer')) || document.getElementById('view-repricer');
  }

  function setStatus(root, message, tone) {
    var target = root && root.querySelector ? root.querySelector('[data-repricer-export-status]') : null;
    if (!target) return;
    target.className = 'repricer-export-status ' + (tone || 'info');
    target.textContent = message || '';
  }

  function showNotice(root, title, message, tone) {
    if (!root) return;
    var panel = root.querySelector('[data-repricer-operator-panel]') || root.querySelector('.section-title') || root;
    var notice = root.querySelector('[data-repricer-download-notice]');
    if (!notice) {
      notice = document.createElement('div');
      notice.setAttribute('data-repricer-download-notice', '1');
      notice.className = 'repricer-download-notice';
      if (panel.nextSibling) panel.parentNode.insertBefore(notice, panel.nextSibling);
      else panel.parentNode.appendChild(notice);
    }
    notice.className = 'repricer-download-notice ' + (tone || 'ok');
    notice.innerHTML = '<strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(message) + '</span>';
  }

  function templateColumns(platform) {
    if (typeof window.repricerTemplateColumns === 'function') {
      try {
        var liveColumns = window.repricerTemplateColumns(platform);
        if (Array.isArray(liveColumns) && liveColumns.length) return liveColumns;
      } catch (error) {}
    }
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

  function getRows() {
    if (typeof window.buildRepricerRows === 'function') {
      try {
        var rows = window.buildRepricerRows();
        return Array.isArray(rows) ? rows : [];
      } catch (error) {}
    }
    return [];
  }

  function getTemplateRows(platform, rows) {
    if (typeof window.repricerExportTemplateRows === 'function') {
      try {
        var templateRows = window.repricerExportTemplateRows(platform, { rows: rows });
        return Array.isArray(templateRows) ? templateRows : [];
      } catch (error) {}
    }
    return [];
  }

  function buildHtmlTable(columns, rows) {
    var head = '<tr>' + columns.map(function (column) {
      return '<th>' + escapeHtml(column[1]) + '</th>';
    }).join('') + '</tr>';
    var body = rows.map(function (row) {
      return '<tr>' + columns.map(function (column) {
        return '<td>' + escapeHtml(row[column[0]]) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1">' + head + body + '</table></body></html>';
  }

  function labelFor(platform) {
    return platform === 'ozon' ? 'Ozon' : 'WB';
  }

  function buildPayload(platform) {
    var normalized = platform === 'ozon' ? 'ozon' : 'wb';
    var rows = getRows();
    var templateRows = getTemplateRows(normalized, rows);
    return {
      platform: normalized,
      label: labelFor(normalized),
      count: templateRows.length,
      filename: 'repricer-upload-' + normalized + '-' + todayIso() + '.xls',
      html: buildHtmlTable(templateColumns(normalized), templateRows)
    };
  }

  async function saveViaServer(payload) {
    var url = new URL('api/repricer-template', window.location.href);
    var response = await fetch(url.toString(), {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: payload.filename,
        html: payload.html
      })
    });
    var data = null;
    try {
      data = await response.json();
    } catch (error) {}
    if (!response.ok || !data || data.ok !== true) {
      throw new Error((data && data.error) || ('HTTP ' + response.status));
    }
    return data;
  }

  function downloadBlobFallback(payload) {
    var blob = new Blob(['\uFEFF', payload.html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = payload.filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function setBusy(button, busy) {
    if (!button) return;
    if (busy) {
      button.setAttribute('data-repricer-saving', '1');
      if ('disabled' in button) button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      return;
    }
    button.removeAttribute('data-repricer-saving');
    if ('disabled' in button) button.disabled = false;
    button.removeAttribute('aria-busy');
  }

  async function handleTemplateExport(button, mode) {
    if (!button || button.getAttribute('data-repricer-saving') === '1') return;
    var root = rootOf(button);
    var platform = mode === 'template:ozon' ? 'ozon' : 'wb';
    var label = labelFor(platform);
    var originalText = button.textContent;
    var payload = buildPayload(platform);
    var rowsText = payload.count
      ? 'строк: ' + formatInt(payload.count)
      : 'строк 0: зеленых безопасных цен нет';

    setBusy(button, true);
    button.textContent = 'Сохраняю...';
    setStatus(root, 'Сохраняю файл ' + label + ' в Downloads...', 'info');

    try {
      var saved = await saveViaServer(payload);
      setStatus(root, 'Файл ' + label + ' сохранен в Downloads: ' + saved.filename + ' (' + rowsText + ').', payload.count ? 'ok' : 'warn');
      showNotice(
        root,
        'Файл сохранен в Downloads',
        saved.filename + ' - ' + rowsText + (saved.revealed ? '. Папка открыта в Проводнике.' : '. Проверьте папку Downloads.'),
        payload.count ? 'ok' : 'warn'
      );
      button.textContent = 'Сохранено';
    } catch (error) {
      console.error('[repricer-attachment-export]', error);
      try {
        downloadBlobFallback(payload);
        setStatus(root, 'Файл ' + label + ' скачан резервным способом: ' + payload.filename + '.', payload.count ? 'ok' : 'warn');
        showNotice(root, 'Файл скачан резервным способом', payload.filename + ' - ' + rowsText, payload.count ? 'ok' : 'warn');
        button.textContent = 'Скачано';
      } catch (fallbackError) {
        console.error('[repricer-attachment-export:fallback]', fallbackError);
        setStatus(root, 'Не удалось сохранить ' + label + ': ' + (fallbackError && fallbackError.message ? fallbackError.message : fallbackError), 'danger');
        button.textContent = 'Ошибка';
      }
    } finally {
      window.setTimeout(function () {
        button.textContent = originalText;
        setBusy(button, false);
      }, 1200);
    }
  }

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest ? event.target.closest('[data-repricer-export]') : null;
    if (!button || !button.closest('#view-repricer')) return;
    var mode = button.getAttribute('data-repricer-export') || '';
    if (mode !== 'template:wb' && mode !== 'template:ozon') return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void handleTemplateExport(button, mode);
  }, true);
})();
