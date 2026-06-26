(function () {
  'use strict';

  if (window.__ALTEA_TABLE_HEADER_FILTERS__) return;
  window.__ALTEA_TABLE_HEADER_FILTERS__ = true;

  const STATE_VERSION = 'v1';
  const ROOT_KEY = 'altea.table';
  const RU_COLLATOR = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });
  const controllers = new WeakMap();
  const filterOperators = {
    number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'empty', 'notEmpty'],
    text: ['contains', 'notContains', 'eq', 'neq', 'starts', 'ends', 'empty', 'notEmpty'],
    date: ['on', 'before', 'after', 'between', 'empty', 'notEmpty']
  };
  const operatorLabels = {
    eq: 'равно',
    neq: 'не равно',
    gt: 'больше',
    gte: 'больше или равно',
    lt: 'меньше',
    lte: 'меньше или равно',
    between: 'между',
    empty: 'пусто',
    notEmpty: 'не пусто',
    contains: 'содержит',
    notContains: 'не содержит',
    starts: 'начинается с',
    ends: 'заканчивается на',
    on: 'в дату',
    before: 'до',
    after: 'после'
  };

  let scheduled = false;
  let inputDebounce = 0;
  let popover = null;
  let detailPopover = null;
  let domObserver = null;
  let kpiRepairTimer = 0;
  let fallbackDataPromise = null;

  function todayKey() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function cleanText(value) {
    return String(value ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function slug(value, fallback = 'table') {
    const safe = cleanText(value).toLowerCase()
      .replace(/[^a-zа-я0-9_-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    return safe || fallback;
  }

  function hashString(value) {
    const text = String(value || '');
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(index);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function parseNumber(value) {
    const original = cleanText(value).replace(/\u2212/g, '-').replace(/[–—]/g, '-');
    if (!original || /^[-—]+$/.test(original) || /^(н\/р|нет данных|null|nan)$/i.test(original)) return null;
    if (/^\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?/.test(original)) return null;
    let text = original.replace(/[^\d,.\-+]/g, '');
    if (!/[0-9]/.test(text)) return null;

    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
      const decimal = lastComma > lastDot ? ',' : '.';
      const thousands = decimal === ',' ? '.' : ',';
      text = text.replaceAll(thousands, '').replace(decimal, '.');
    } else if (lastComma >= 0) {
      text = text.replace(',', '.');
    }

    text = text.replace(/(?!^)[+-]/g, '');
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  function parseDateValue(value) {
    const text = cleanText(value);
    if (!text || /^[-—]+$/.test(text)) return null;
    const iso = text.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
    if (iso) {
      const timestamp = Date.parse(`${iso[1]}-${iso[2]}-${iso[3] || '01'}T00:00:00`);
      return Number.isFinite(timestamp) ? timestamp : null;
    }
    const ru = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s+\d{1,2}:\d{2})?/);
    if (ru) {
      const year = Number(ru[3].length === 2 ? `20${ru[3]}` : ru[3]);
      const timestamp = new Date(year, Number(ru[2]) - 1, Number(ru[1])).getTime();
      return Number.isFinite(timestamp) ? timestamp : null;
    }
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function dateInputToTimestamp(value) {
    if (!value) return null;
    const parsed = Date.parse(`${value}T00:00:00`);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function dateLabel(value) {
    const timestamp = dateInputToTimestamp(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString('ru-RU') : String(value || '');
  }

  function parseBoolean(value) {
    const text = cleanText(value).toLowerCase();
    if (!text || text === '—' || text === '-') return null;
    if (['да', 'yes', 'true', '1', '+', 'есть', 'ок'].includes(text)) return true;
    if (['нет', 'no', 'false', '0', 'нет данных'].includes(text)) return false;
    return null;
  }

  function isInteractiveTarget(target) {
    return Boolean(target.closest('button, a, input, select, textarea, label, [role="button"], [contenteditable="true"]'));
  }

  function headerText(th) {
    const clone = th.cloneNode(true);
    clone.querySelectorAll('.altea-th-filter-btn,.altea-th-state').forEach((node) => node.remove());
    return cleanText(clone.textContent || th.getAttribute('aria-label') || th.title || '');
  }

  function getHeaderRecords(table) {
    const thead = table.tHead;
    if (!thead) return [];
    const rows = Array.from(thead.rows);
    const grid = [];
    const records = new Map();
    rows.forEach((row, rowIndex) => {
      if (!grid[rowIndex]) grid[rowIndex] = [];
      let column = 0;
      Array.from(row.cells).forEach((cell) => {
        while (grid[rowIndex][column]) column += 1;
        const colSpan = Math.max(1, cell.colSpan || 1);
        const rowSpan = Math.max(1, cell.rowSpan || 1);
        records.set(cell, { th: cell, row: rowIndex, col: column, colSpan, rowSpan });
        for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
          const gridRow = rowIndex + rowOffset;
          if (!grid[gridRow]) grid[gridRow] = [];
          for (let colOffset = 0; colOffset < colSpan; colOffset += 1) {
            grid[gridRow][column + colOffset] = cell;
          }
        }
        column += colSpan;
      });
    });

    const bodyColumnCount = Array.from(table.tBodies || [])
      .flatMap((tbody) => Array.from(tbody.rows || []))
      .find((row) => row.cells.length)?.cells.length || Math.max(0, ...grid.map((row) => row.length));

    return Array.from(records.values())
      .filter((record) => {
        if (record.colSpan !== 1 || record.col >= bodyColumnCount) return false;
        for (let row = record.row + 1; row < grid.length; row += 1) {
          if (grid[row]?.[record.col] && grid[row][record.col] !== record.th) return false;
        }
        return true;
      })
      .sort((left, right) => left.col - right.col);
  }

  function inferType(label, values) {
    const texts = values.map(cleanText).filter(Boolean).filter((value) => !/^[-—]+$/.test(value));
    if (!texts.length) return 'text';
    const lowerLabel = label.toLowerCase();
    const articleLike = /(sku|артикул|код|id|штрих)/i.test(lowerLabel);
    const boolCount = texts.filter((value) => parseBoolean(value) !== null).length;
    if (boolCount && boolCount / texts.length >= 0.85) return 'boolean';

    const dateCount = texts.filter((value) => parseDateValue(value) !== null).length;
    if (dateCount && (dateCount / texts.length >= 0.72 || /(дата|дедлайн|срок|период|месяц|старт|финиш)/i.test(lowerLabel))) {
      return 'date';
    }

    const numberCount = texts.filter((value) => parseNumber(value) !== null).length;
    if (!articleLike && numberCount && numberCount / texts.length >= 0.68) return 'number';
    return 'text';
  }

  function inferFilterMode(type, label, values) {
    if (type === 'boolean') return 'boolean';
    if (type === 'date') return 'date';
    if (type === 'number') return 'number';
    const cleanValues = values.map(cleanText).filter(Boolean);
    const unique = new Set(cleanValues.map((value) => value.toLowerCase()));
    const labelLooksEnum = /(статус|owner|ответственный|площад|market|тип|категор|приоритет|контур|канал|бренд)/i.test(label);
    if (unique.size > 0 && unique.size <= 36 && (labelLooksEnum || unique.size / Math.max(1, cleanValues.length) <= 0.55)) {
      return 'enum';
    }
    return 'text';
  }

  function compareValues(left, right, type) {
    const leftEmpty = left.value === null || left.value === undefined || left.text === '';
    const rightEmpty = right.value === null || right.value === undefined || right.text === '';
    if (leftEmpty && rightEmpty) return left.index - right.index;
    if (leftEmpty) return 1;
    if (rightEmpty) return -1;
    if (type === 'number' || type === 'date') return Number(left.value) - Number(right.value);
    if (type === 'boolean') return Number(left.value) - Number(right.value);
    return RU_COLLATOR.compare(left.text, right.text);
  }

  class TableController {
    constructor(table) {
      this.table = table;
      this.uid = `altea-table-${Math.random().toString(36).slice(2, 10)}`;
      this.routeId = this.resolveRouteId();
      this.tableId = this.resolveTableId();
      this.storageKey = `${ROOT_KEY}.${this.routeId}.${this.tableId}.${STATE_VERSION}`;
      this.state = this.loadState();
      this.headers = [];
      this.columns = [];
      this.rowInfos = [];
      this.statebar = null;
      this.mount();
    }

    resolveRouteId() {
      const view = this.table.closest('.view');
      if (view?.id) return slug(view.id.replace(/^view-/, ''), 'route');
      const modal = this.table.closest('.modal');
      if (modal?.id) return slug(modal.id, 'modal');
      return 'portal';
    }

    resolveTableId() {
      const explicit = this.table.id || this.table.dataset.tableId || this.table.getAttribute('aria-label') || '';
      const signature = this.headerSignature();
      const scope = this.table.closest('.view,.modal,.main') || document;
      const ordinal = Math.max(0, Array.from(scope.querySelectorAll('table')).indexOf(this.table));
      const base = explicit || signature || this.table.className || `table-${ordinal + 1}`;
      return `${slug(base, 'table')}-${hashString(`${signature}|${ordinal}`)}`;
    }

    headerSignature() {
      return getHeaderRecords(this.table).map((record) => headerText(record.th)).filter(Boolean).join('|');
    }

    loadState() {
      const fallback = { day: todayKey(), sort: [], filters: {} };
      try {
        const raw = localStorage.getItem(this.storageKey);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.day !== todayKey()) return fallback;
        return {
          day: todayKey(),
          sort: Array.isArray(parsed.sort) ? parsed.sort : [],
          filters: parsed.filters && typeof parsed.filters === 'object' ? parsed.filters : {}
        };
      } catch (error) {
        console.warn('[table-filters] state read', error);
        return fallback;
      }
    }

    saveState() {
      try {
        const hasSort = this.state.sort.length > 0;
        const hasFilters = Object.keys(this.state.filters).length > 0;
        if (!hasSort && !hasFilters) {
          localStorage.removeItem(this.storageKey);
          return;
        }
        localStorage.setItem(this.storageKey, JSON.stringify({
          day: todayKey(),
          sort: this.state.sort,
          filters: this.state.filters
        }));
      } catch (error) {
        console.warn('[table-filters] state save', error);
      }
    }

    mount() {
      if (!this.table.tHead || !this.table.tBodies.length) return;
      this.table.classList.add('altea-table-controller-ready');
      this.refreshHeaders();
      this.refreshRows();
      this.ensureStatebar();
      this.applyState({ persist: false });
    }

    refreshHeaders() {
      const records = getHeaderRecords(this.table);
      this.headers = records.map((record, index) => {
        const label = headerText(record.th) || `Колонка ${record.col + 1}`;
        const id = `${slug(label, `col-${record.col + 1}`)}-${record.col}`;
        record.th.dataset.alteaTableUid = this.uid;
        record.th.dataset.alteaColumnId = id;
        record.th.dataset.alteaColumnIndex = String(record.col);
        record.th.dataset.alteaTableFilterCol = '1';
        record.th.tabIndex = record.th.tabIndex >= 0 ? record.th.tabIndex : 0;
        this.decorateHeader(record.th, label);
        return { ...record, id, label, order: index };
      });
      this.columns = this.headers.map((header) => ({
        id: header.id,
        label: header.label,
        index: header.col,
        type: 'text',
        filterMode: 'text'
      }));
      if (this.rowInfos.length) this.inferColumns();
    }

    decorateHeader(th, label) {
      if (!th.querySelector(':scope > .altea-th-filter-btn')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'altea-th-filter-btn';
        button.setAttribute('aria-label', `Фильтр: ${label}`);
        button.title = `Фильтр: ${label}`;
        button.textContent = '⌄';
        th.appendChild(button);
      }
      if (!th.querySelector(':scope > .altea-th-state')) {
        const state = document.createElement('span');
        state.className = 'altea-th-state';
        state.setAttribute('aria-hidden', 'true');
        th.appendChild(state);
      }
    }

    refreshRows({ force = false } = {}) {
      const tbody = this.table.tBodies[0];
      if (!tbody) return;
      const rows = Array.from(tbody.rows || []);
      const needsRefresh = rows.length !== this.rowInfos.length || rows.some((row, index) => this.rowInfos[index]?.row !== row);
      if (!force && !needsRefresh) return;
      this.tbody = tbody;
      this.rowInfos = rows.map((row, index) => ({
        row,
        index,
        values: new Map(),
        originalDisplay: row.style.display && row.style.display !== 'none' ? row.style.display : ''
      }));
      this.inferColumns();
    }

    inferColumns() {
      this.columns = this.headers.map((header) => {
        const values = this.rowInfos.map((info) => this.cellText(info.row, header.col));
        const type = inferType(header.label, values);
        return {
          id: header.id,
          label: header.label,
          index: header.col,
          type,
          filterMode: inferFilterMode(type, header.label, values)
        };
      });
    }

    cellText(row, columnIndex) {
      return cleanText(row.cells[columnIndex]?.textContent || '');
    }

    normalized(info, column) {
      const cached = info.values.get(column.id);
      if (cached) return cached;
      const text = this.cellText(info.row, column.index);
      let value = text;
      if (column.type === 'number') value = parseNumber(text);
      else if (column.type === 'date') value = parseDateValue(text);
      else if (column.type === 'boolean') value = parseBoolean(text);
      const result = { text, lower: text.toLowerCase(), value, index: info.index };
      info.values.set(column.id, result);
      return result;
    }

    columnById(columnId) {
      return this.columns.find((column) => column.id === columnId) || null;
    }

    ensureStatebar() {
      if (this.statebar?.isConnected) return;
      const host = this.table.closest('.table-wrap,.imperial-table-wrap,.pw-table-wrap,.pw-history-wrap,.iu-drr-funnel-table-wrap,.ads-control-table-wrap,.altea-order-procurement__table-wrap') || this.table.parentElement;
      if (!host?.parentElement) return;
      const previous = host.previousElementSibling;
      if (previous?.classList?.contains('altea-table-statebar') && previous.dataset.tableId === this.tableId) {
        this.statebar = previous;
      } else {
        this.statebar = document.createElement('div');
        this.statebar.className = 'altea-table-statebar';
        this.statebar.dataset.tableId = this.tableId;
        host.parentElement.insertBefore(this.statebar, host);
      }
      this.statebar.__alteaTableController = this;
    }

    activeFilterEntries() {
      return Object.entries(this.state.filters).filter(([, filter]) => filter && typeof filter === 'object');
    }

    filterCount() {
      return this.activeFilterEntries().length;
    }

    sortFor(columnId) {
      return this.state.sort.find((item) => item.columnId === columnId) || null;
    }

    toggleSort(columnId, additive) {
      this.refreshRows();
      const currentIndex = this.state.sort.findIndex((item) => item.columnId === columnId);
      let nextSort = additive ? [...this.state.sort] : [];
      const current = currentIndex >= 0 ? this.state.sort[currentIndex] : null;
      if (!current) {
        if (additive) nextSort.push({ columnId, dir: 'asc' });
        else nextSort = [{ columnId, dir: 'asc' }];
      } else if (current.dir === 'asc') {
        if (additive) nextSort[currentIndex] = { columnId, dir: 'desc' };
        else nextSort = [{ columnId, dir: 'desc' }];
      } else if (additive) {
        nextSort.splice(currentIndex, 1);
      } else {
        nextSort = [];
      }
      this.state.sort = nextSort;
      this.applyState({ persist: true });
    }

    setFilter(columnId, filter) {
      if (!filter) delete this.state.filters[columnId];
      else this.state.filters[columnId] = filter;
      this.applyState({ persist: true });
    }

    clearFilter(columnId) {
      delete this.state.filters[columnId];
      this.applyState({ persist: true });
    }

    resetFilters() {
      this.state.filters = {};
      this.applyState({ persist: true });
    }

    resetSort() {
      this.state.sort = [];
      this.applyState({ persist: true });
    }

    applyState({ persist }) {
      this.refreshHeaders();
      this.refreshRows({ force: true });
      const sorted = this.sortedRows();
      const visibleSet = new Set();
      this.rowInfos.forEach((info) => {
        if (this.rowMatches(info)) visibleSet.add(info.row);
      });
      const scroller = this.table.closest('.table-wrap,.imperial-table-wrap,.pw-table-wrap,.pw-history-wrap,.iu-drr-funnel-table-wrap,.ads-control-table-wrap,.altea-order-procurement__table-wrap') || this.table.parentElement;
      const scrollLeft = scroller?.scrollLeft || 0;
      const scrollTop = scroller?.scrollTop || 0;
      if (this.tbody && sorted.length) {
        const fragment = document.createDocumentFragment();
        sorted.forEach((info) => fragment.appendChild(info.row));
        this.tbody.appendChild(fragment);
      }
      this.rowInfos.forEach((info) => {
        const visible = visibleSet.has(info.row);
        info.row.style.display = visible ? info.originalDisplay : 'none';
        info.row.setAttribute('aria-hidden', visible ? 'false' : 'true');
        if (visible) info.row.removeAttribute('data-altea-filtered-out');
        else info.row.dataset.alteaFilteredOut = '1';
      });
      if (scroller) {
        scroller.scrollLeft = scrollLeft;
        scroller.scrollTop = scrollTop;
      }
      this.updateHeaders();
      this.renderStatebar(visibleSet.size, this.rowInfos.length);
      if (persist) this.saveState();
    }

    sortedRows() {
      if (!this.state.sort.length) return [...this.rowInfos].sort((left, right) => left.index - right.index);
      return [...this.rowInfos].sort((left, right) => {
        for (const sort of this.state.sort) {
          const column = this.columnById(sort.columnId);
          if (!column) continue;
          const result = compareValues(this.normalized(left, column), this.normalized(right, column), column.type);
          if (result !== 0) return sort.dir === 'desc' ? -result : result;
        }
        return left.index - right.index;
      });
    }

    rowMatches(info) {
      return this.activeFilterEntries().every(([columnId, filter]) => {
        const column = this.columnById(columnId);
        if (!column) return true;
        return this.matchesFilter(this.normalized(info, column), column, filter);
      });
    }

    matchesFilter(value, column, filter) {
      const empty = value.text === '' || value.text === '—' || value.value === null || value.value === undefined;
      if (filter.mode === 'enum') {
        const selected = Array.isArray(filter.values) ? filter.values.map((item) => String(item).toLowerCase()) : [];
        if (!selected.length) return true;
        const has = selected.includes(value.text.toLowerCase());
        return filter.include === 'exclude' ? !has : has;
      }
      if (filter.mode === 'boolean') {
        if (!filter.value || filter.value === 'all') return true;
        if (filter.value === 'empty') return empty;
        if (filter.value === 'yes') return value.value === true;
        if (filter.value === 'no') return value.value === false;
        return true;
      }
      if (filter.op === 'empty') return empty;
      if (filter.op === 'notEmpty') return !empty;
      if (empty) return false;
      if (column.type === 'number') return this.matchesNumber(value.value, filter);
      if (column.type === 'date') return this.matchesDate(value.value, filter);
      return this.matchesText(value.lower, filter);
    }

    matchesNumber(number, filter) {
      const first = parseNumber(filter.value);
      const second = parseNumber(filter.valueTo);
      if (!Number.isFinite(number)) return false;
      if (filter.op === 'between') {
        if (!Number.isFinite(first) || !Number.isFinite(second)) return true;
        return number >= Math.min(first, second) && number <= Math.max(first, second);
      }
      if (!Number.isFinite(first)) return true;
      if (filter.op === 'eq') return number === first;
      if (filter.op === 'neq') return number !== first;
      if (filter.op === 'gt') return number > first;
      if (filter.op === 'gte') return number >= first;
      if (filter.op === 'lt') return number < first;
      if (filter.op === 'lte') return number <= first;
      return true;
    }

    matchesDate(timestamp, filter) {
      const first = dateInputToTimestamp(filter.value);
      const second = dateInputToTimestamp(filter.valueTo);
      const dayEnd = (value) => value + 24 * 60 * 60 * 1000 - 1;
      if (!Number.isFinite(timestamp)) return false;
      if (filter.op === 'between') {
        if (!Number.isFinite(first) || !Number.isFinite(second)) return true;
        return timestamp >= Math.min(first, second) && timestamp <= dayEnd(Math.max(first, second));
      }
      if (!Number.isFinite(first)) return true;
      if (filter.op === 'on') return timestamp >= first && timestamp <= dayEnd(first);
      if (filter.op === 'before') return timestamp < first;
      if (filter.op === 'after') return timestamp > dayEnd(first);
      return true;
    }

    matchesText(text, filter) {
      const needle = String(filter.value || '').trim().toLowerCase();
      if (!needle) return true;
      if (filter.op === 'contains') return text.includes(needle);
      if (filter.op === 'notContains') return !text.includes(needle);
      if (filter.op === 'eq') return text === needle;
      if (filter.op === 'neq') return text !== needle;
      if (filter.op === 'starts') return text.startsWith(needle);
      if (filter.op === 'ends') return text.endsWith(needle);
      return true;
    }

    updateHeaders() {
      this.headers.forEach((header) => {
        const sort = this.sortFor(header.id);
        const sortIndex = sort ? this.state.sort.findIndex((item) => item.columnId === header.id) + 1 : 0;
        const filter = this.state.filters[header.id];
        const stateNode = header.th.querySelector(':scope > .altea-th-state');
        const filterButton = header.th.querySelector(':scope > .altea-th-filter-btn');
        header.th.classList.toggle('is-sorted', Boolean(sort));
        header.th.classList.toggle('has-column-filter', Boolean(filter));
        if (filterButton) filterButton.classList.toggle('is-active', Boolean(filter));
        if (!stateNode) return;
        const pieces = [];
        if (sort) {
          pieces.push(`<span class="altea-th-state-badge" title="Сортировка">${sort.dir === 'desc' ? '↓' : '↑'}${this.state.sort.length > 1 ? sortIndex : ''}</span>`);
        }
        if (filter) {
          const count = filter.mode === 'enum' && Array.isArray(filter.values) ? filter.values.length : '';
          pieces.push(`<span class="altea-th-state-badge" title="Фильтр">${count || '•'}</span>`);
        }
        stateNode.innerHTML = pieces.join('');
      });
    }

    renderStatebar(visibleCount, totalCount) {
      this.ensureStatebar();
      if (!this.statebar) return;
      const chips = [];
      this.state.sort.forEach((sort, index) => {
        const column = this.columnById(sort.columnId);
        if (!column) return;
        chips.push(`
          <span class="altea-table-chip" title="Сортировка">
            <span>${escapeHtml(column.label)} ${sort.dir === 'desc' ? '↓' : '↑'}${this.state.sort.length > 1 ? ` #${index + 1}` : ''}</span>
            <button type="button" data-altea-remove-sort="${escapeHtml(sort.columnId)}" aria-label="Убрать сортировку">×</button>
          </span>
        `);
      });
      this.activeFilterEntries().forEach(([columnId, filter]) => {
        const column = this.columnById(columnId);
        if (!column) return;
        chips.push(`
          <span class="altea-table-chip" title="Фильтр">
            <span>${escapeHtml(column.label)}: ${escapeHtml(this.filterLabel(column, filter))}</span>
            <button type="button" data-altea-remove-filter="${escapeHtml(columnId)}" aria-label="Убрать фильтр">×</button>
          </span>
        `);
      });
      this.statebar.innerHTML = `
        <div class="altea-table-statebar__main">
          <span class="altea-table-statebar__count">Показано ${visibleCount} из ${totalCount}</span>
          <div class="altea-table-statebar__chips">${chips.join('')}</div>
        </div>
        <div class="altea-table-statebar__actions">
          <button type="button" data-altea-reset-filters ${this.filterCount() ? '' : 'disabled'}>Сбросить фильтры</button>
          <button type="button" data-altea-reset-sort ${this.state.sort.length ? '' : 'disabled'}>Сбросить сортировку</button>
        </div>
      `;
      this.statebar.__alteaTableController = this;
    }

    filterLabel(column, filter) {
      if (filter.mode === 'enum') {
        const action = filter.include === 'exclude' ? 'исключить' : 'выбрано';
        return `${action} ${(filter.values || []).length}`;
      }
      if (filter.mode === 'boolean') {
        return ({ yes: 'да', no: 'нет', empty: 'нет данных', all: 'все' })[filter.value] || 'все';
      }
      if (column.type === 'date') {
        const value = dateLabel(filter.value);
        const valueTo = dateLabel(filter.valueTo);
        return filter.op === 'between'
          ? `${operatorLabels[filter.op]} ${value} - ${valueTo}`
          : `${operatorLabels[filter.op] || filter.op}${value ? ` ${value}` : ''}`;
      }
      return filter.op === 'between'
        ? `${operatorLabels[filter.op]} ${filter.value || ''} - ${filter.valueTo || ''}`
        : `${operatorLabels[filter.op] || filter.op}${filter.value ? ` ${filter.value}` : ''}`;
    }

    enumOptions(column) {
      const counts = new Map();
      this.rowInfos.forEach((info) => {
        const value = this.normalized(info, column).text;
        if (!value) return;
        const key = value.toLowerCase();
        const existing = counts.get(key) || { value, count: 0 };
        existing.count += 1;
        counts.set(key, existing);
      });
      return Array.from(counts.values())
        .sort((left, right) => RU_COLLATOR.compare(left.value, right.value))
        .slice(0, 180);
    }
  }

  class FilterPopover {
    constructor() {
      this.root = document.createElement('div');
      this.root.className = 'altea-filter-popover';
      this.root.hidden = true;
      this.root.setAttribute('role', 'dialog');
      this.root.setAttribute('aria-modal', 'false');
      document.body.appendChild(this.root);
      this.controller = null;
      this.column = null;
      this.restoreFocus = null;
      this.bind();
    }

    bind() {
      this.root.addEventListener('click', (event) => this.onClick(event));
      this.root.addEventListener('input', (event) => {
        if (event.target.matches('[data-altea-option-search]')) this.filterOptions(event.target.value);
      });
      this.root.addEventListener('change', () => this.updateInputVisibility());
      document.addEventListener('keydown', (event) => {
        if (!this.root.hidden && event.key === 'Escape') this.close({ restore: true });
      });
      document.addEventListener('mousedown', (event) => {
        if (this.root.hidden) return;
        if (this.root.contains(event.target)) return;
        if (event.target.closest('.altea-th-filter-btn')) return;
        this.close({ restore: false });
      });
    }

    open(controller, column, anchor) {
      this.controller = controller;
      this.column = column;
      this.restoreFocus = anchor;
      this.render();
      this.root.hidden = false;
      this.root.style.visibility = 'hidden';
      this.position(anchor);
      this.root.style.visibility = '';
      this.updateInputVisibility();
      const focusTarget = this.root.querySelector('input,select,button');
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    }

    close({ restore }) {
      this.root.hidden = true;
      this.controller = null;
      this.column = null;
      if (restore && this.restoreFocus?.isConnected) this.restoreFocus.focus({ preventScroll: true });
      this.restoreFocus = null;
    }

    position(anchor) {
      const rect = anchor.getBoundingClientRect();
      const pad = 12;
      const width = Math.min(360, window.innerWidth - 24);
      const left = Math.min(Math.max(pad, rect.left), window.innerWidth - width - pad);
      const maxHeight = Math.max(160, Math.min(620, window.innerHeight - pad * 2));
      this.root.style.maxHeight = `${maxHeight}px`;
      const measuredHeight = Math.min(this.root.offsetHeight || maxHeight, maxHeight);
      let top = rect.bottom + 8;
      if (top + measuredHeight > window.innerHeight - pad) {
        const flippedTop = rect.top - measuredHeight - 8;
        top = flippedTop >= pad ? flippedTop : pad;
      }
      const availableHeight = Math.max(160, window.innerHeight - top - pad);
      this.root.style.left = `${left}px`;
      this.root.style.top = `${Math.max(pad, top)}px`;
      this.root.style.maxHeight = `${Math.min(620, availableHeight)}px`;
    }

    render() {
      const filter = this.controller.state.filters[this.column.id] || null;
      const body = this.column.filterMode === 'enum'
        ? this.renderEnum(filter)
        : this.column.filterMode === 'boolean'
          ? this.renderBoolean(filter)
          : this.renderCondition(filter);
      this.root.innerHTML = `
        <div class="altea-filter-popover__head">
          <div>
            <h3 class="altea-filter-popover__title">${escapeHtml(this.column.label)}</h3>
            <div class="altea-filter-popover__meta">Варианты пересчитаны на ${escapeHtml(todayKey())}</div>
          </div>
          <button class="altea-filter-popover__close" type="button" data-altea-filter-close aria-label="Закрыть">×</button>
        </div>
        ${body}
        <div class="altea-filter-popover__actions">
          <button type="button" data-altea-filter-clear>Очистить</button>
          <button type="button" class="primary" data-altea-filter-apply>Применить</button>
        </div>
      `;
    }

    renderCondition(filter) {
      const mode = this.column.filterMode;
      const operators = filterOperators[mode] || filterOperators.text;
      const selectedOp = filter?.op || operators[0];
      const inputType = mode === 'date' ? 'date' : 'text';
      return `
        <div class="altea-filter-field">
          <label for="alteaFilterOperator">Условие</label>
          <select id="alteaFilterOperator" data-altea-filter-op>
            ${operators.map((operator) => `<option value="${operator}" ${operator === selectedOp ? 'selected' : ''}>${escapeHtml(operatorLabels[operator] || operator)}</option>`).join('')}
          </select>
        </div>
        <div class="altea-filter-between" data-altea-filter-values>
          <div class="altea-filter-field">
            <label for="alteaFilterValue">Значение</label>
            <input id="alteaFilterValue" data-altea-filter-value type="${inputType}" value="${escapeHtml(filter?.value || '')}">
          </div>
          <div class="altea-filter-field" data-altea-filter-second-wrap>
            <label for="alteaFilterValueTo">До</label>
            <input id="alteaFilterValueTo" data-altea-filter-value-to type="${inputType}" value="${escapeHtml(filter?.valueTo || '')}">
          </div>
        </div>
      `;
    }

    renderBoolean(filter) {
      const value = filter?.value || 'all';
      return `
        <div class="altea-filter-field">
          <label for="alteaFilterBoolean">Значение</label>
          <select id="alteaFilterBoolean" data-altea-filter-boolean>
            ${[
              ['all', 'все'],
              ['yes', 'да'],
              ['no', 'нет'],
              ['empty', 'нет данных']
            ].map(([key, label]) => `<option value="${key}" ${key === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
      `;
    }

    renderEnum(filter) {
      const options = this.controller.enumOptions(this.column);
      const selected = new Set((filter?.values || []).map((value) => String(value).toLowerCase()));
      const include = filter?.include || 'include';
      return `
        <div class="altea-filter-field">
          <label for="alteaFilterInclude">Режим</label>
          <select id="alteaFilterInclude" data-altea-filter-include>
            <option value="include" ${include === 'include' ? 'selected' : ''}>Включать выбранные</option>
            <option value="exclude" ${include === 'exclude' ? 'selected' : ''}>Исключать выбранные</option>
          </select>
        </div>
        <div class="altea-filter-field">
          <label for="alteaFilterOptionSearch">Поиск вариантов</label>
          <input id="alteaFilterOptionSearch" type="search" data-altea-option-search autocomplete="off">
        </div>
        <div class="altea-filter-popover__mini-actions">
          <button type="button" data-altea-options-all>Выбрать всё</button>
          <button type="button" data-altea-options-none>Очистить выбор</button>
        </div>
        <div class="altea-filter-options-head">${options.length} вариантов</div>
        <div class="altea-filter-options" data-altea-filter-options>
          ${options.map((option) => `
            <label class="altea-filter-option">
              <input type="checkbox" value="${escapeHtml(option.value)}" ${selected.has(option.value.toLowerCase()) ? 'checked' : ''}>
              <span>${escapeHtml(option.value)}</span>
              <em>${option.count}</em>
            </label>
          `).join('')}
        </div>
      `;
    }

    onClick(event) {
      if (event.target.closest('[data-altea-filter-close]')) {
        this.close({ restore: true });
        return;
      }
      if (event.target.closest('[data-altea-filter-clear]')) {
        this.controller.clearFilter(this.column.id);
        this.close({ restore: true });
        return;
      }
      if (event.target.closest('[data-altea-options-all]')) {
        this.root.querySelectorAll('[data-altea-filter-options] input[type="checkbox"]').forEach((input) => { input.checked = true; });
        return;
      }
      if (event.target.closest('[data-altea-options-none]')) {
        this.root.querySelectorAll('[data-altea-filter-options] input[type="checkbox"]').forEach((input) => { input.checked = false; });
        return;
      }
      if (event.target.closest('[data-altea-filter-apply]')) {
        this.apply();
        this.close({ restore: true });
      }
    }

    apply() {
      if (!this.controller || !this.column) return;
      if (this.column.filterMode === 'enum') {
        const values = Array.from(this.root.querySelectorAll('[data-altea-filter-options] input[type="checkbox"]:checked')).map((input) => input.value);
        if (!values.length) this.controller.clearFilter(this.column.id);
        else this.controller.setFilter(this.column.id, {
          mode: 'enum',
          include: this.root.querySelector('[data-altea-filter-include]')?.value || 'include',
          values
        });
        return;
      }
      if (this.column.filterMode === 'boolean') {
        const value = this.root.querySelector('[data-altea-filter-boolean]')?.value || 'all';
        if (value === 'all') this.controller.clearFilter(this.column.id);
        else this.controller.setFilter(this.column.id, { mode: 'boolean', value });
        return;
      }
      const op = this.root.querySelector('[data-altea-filter-op]')?.value || 'contains';
      const value = this.root.querySelector('[data-altea-filter-value]')?.value || '';
      const valueTo = this.root.querySelector('[data-altea-filter-value-to]')?.value || '';
      const needsValue = !['empty', 'notEmpty'].includes(op);
      if (needsValue && !value && op !== 'between') {
        this.controller.clearFilter(this.column.id);
        return;
      }
      this.controller.setFilter(this.column.id, { mode: this.column.filterMode, op, value, valueTo });
    }

    updateInputVisibility() {
      const op = this.root.querySelector('[data-altea-filter-op]')?.value || '';
      const values = this.root.querySelector('[data-altea-filter-values]');
      const second = this.root.querySelector('[data-altea-filter-second-wrap]');
      if (values) values.style.display = ['empty', 'notEmpty'].includes(op) ? 'none' : '';
      if (second) second.style.display = op === 'between' ? '' : 'none';
    }

    filterOptions(query) {
      const needle = String(query || '').trim().toLowerCase();
      this.root.querySelectorAll('.altea-filter-option').forEach((option) => {
        option.hidden = needle && !option.textContent.toLowerCase().includes(needle);
      });
    }
  }

  function getPopover() {
    if (!popover) popover = new FilterPopover();
    return popover;
  }

  class CellDetailPopover {
    constructor() {
      this.root = document.createElement('div');
      this.root.className = 'altea-cell-detail-popover';
      this.root.hidden = true;
      this.root.setAttribute('role', 'dialog');
      this.root.setAttribute('aria-modal', 'false');
      document.body.appendChild(this.root);
      this.bind();
    }

    bind() {
      this.root.addEventListener('click', (event) => {
        if (event.target.closest('[data-altea-cell-detail-close]')) this.close();
      });
      document.addEventListener('keydown', (event) => {
        if (!this.root.hidden && event.key === 'Escape') this.close();
      });
      document.addEventListener('mousedown', (event) => {
        if (this.root.hidden) return;
        if (this.root.contains(event.target)) return;
        if (event.target.closest('td')) return;
        this.close();
      });
    }

    open(detail, anchorEvent) {
      this.root.innerHTML = `
        <div class="altea-cell-detail-popover__head">
          <div>
            <h3>${escapeHtml(detail.title || 'Деталь')}</h3>
            <p>${escapeHtml(detail.context || '')}</p>
          </div>
          <button type="button" data-altea-cell-detail-close aria-label="Закрыть">×</button>
        </div>
        <dl class="altea-cell-detail-popover__grid">
          <div><dt>Показатель</dt><dd>${escapeHtml(detail.column || 'Колонка')}</dd></div>
          <div><dt>Строка</dt><dd>${escapeHtml(detail.row || 'Текущая строка')}</dd></div>
          <div><dt>Значение</dt><dd class="altea-cell-detail-popover__value">${escapeHtml(detail.value || 'Нет значения')}</dd></div>
        </dl>
      `;
      this.root.hidden = false;
      this.root.style.visibility = 'hidden';
      this.position(anchorEvent);
      this.root.style.visibility = '';
    }

    close() {
      this.root.hidden = true;
    }

    position(anchorEvent) {
      const pad = 12;
      const width = Math.min(360, window.innerWidth - 24);
      const height = Math.min(this.root.offsetHeight || 220, window.innerHeight - pad * 2);
      const anchorX = Number.isFinite(anchorEvent?.clientX) ? anchorEvent.clientX : window.innerWidth / 2;
      const anchorY = Number.isFinite(anchorEvent?.clientY) ? anchorEvent.clientY : window.innerHeight / 2;
      const left = Math.min(Math.max(pad, anchorX + 12), window.innerWidth - width - pad);
      let top = anchorY + 12;
      if (top + height > window.innerHeight - pad) top = anchorY - height - 12;
      this.root.style.left = `${Math.max(pad, left)}px`;
      this.root.style.top = `${Math.max(pad, top)}px`;
      this.root.style.width = `${width}px`;
      this.root.style.maxHeight = `${Math.max(160, window.innerHeight - Math.max(pad, top) - pad)}px`;
    }
  }

  function getDetailPopover() {
    if (!detailPopover) detailPopover = new CellDetailPopover();
    return detailPopover;
  }

  function tableContextLabel(table) {
    const candidates = [];
    let node = table;
    while (node && node !== document.body) {
      const heading = node.querySelector?.('h1,h2,h3,h4,.section-title,.card-title,.table-title,[data-title]');
      if (heading && !heading.closest('table')) candidates.push(cleanText(heading.textContent || heading.dataset.title || ''));
      if (node.previousElementSibling) candidates.push(cleanText(node.previousElementSibling.textContent || ''));
      node = node.parentElement;
      if (candidates.some(Boolean)) break;
    }
    return candidates.find(Boolean) || cleanText(document.querySelector('.view.active h1,.view.active h2')?.textContent || '');
  }

  function columnLabelForCell(table, cellIndex) {
    const controller = ensureController(table);
    const column = controller?.columns?.find((item) => item.index === cellIndex);
    if (column?.label) return column.label;
    const record = getHeaderRecords(table).find((item) => item.col === cellIndex);
    return record ? headerText(record.th) : `Колонка ${cellIndex + 1}`;
  }

  function rowLabelForCell(td) {
    const row = td.closest('tr');
    if (!row) return '';
    const pieces = Array.from(row.cells || [])
      .filter((cell) => cell !== td)
      .slice(0, 3)
      .map((cell) => cleanText(cell.textContent || ''))
      .filter(Boolean);
    return pieces.join(' / ');
  }

  function openCellDetail(td, event) {
    if (!td || !td.closest('tbody')) return false;
    const table = td.closest('table');
    if (!table) return false;
    const value = cleanText(td.textContent || '');
    const context = tableContextLabel(table);
    const detail = {
      title: context || 'Таблица',
      context,
      column: columnLabelForCell(table, td.cellIndex),
      row: rowLabelForCell(td),
      value: value && !/^[-—]+$/.test(value) ? value : 'Нет значения'
    };
    getDetailPopover().open(detail, event);
    return true;
  }

  function ensureController(table) {
    if (!table || !table.isConnected || !table.tHead || !table.tBodies.length) return null;
    let controller = controllers.get(table);
    if (!controller) {
      controller = new TableController(table);
      controllers.set(table, controller);
    } else {
      controller.mount();
    }
    return controller;
  }

  function activeScopes() {
    const scopes = Array.from(document.querySelectorAll('.view.active'));
    document.querySelectorAll('.modal.open').forEach((modal) => scopes.push(modal));
    if (!scopes.length) scopes.push(document.querySelector('.main') || document.body);
    return scopes.filter(Boolean);
  }

  function enhanceActiveTables() {
    activeScopes().forEach((scope) => {
      scope.querySelectorAll('table').forEach((table) => ensureController(table));
    });
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      enhanceActiveTables();
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run);
    else window.setTimeout(run, 0);
  }

  function scheduleLazyRouteEnhance() {
    scheduleEnhance();
    window.setTimeout(scheduleEnhance, 260);
    window.setTimeout(scheduleEnhance, 1100);
  }

  function activeIuDrrRoot() {
    return document.querySelector('#view-iu-drr.view.active') || document.querySelector('#view-iu-drr');
  }

  function looksLikePositionFunnel(root) {
    const text = cleanText(root?.textContent || '').toLowerCase();
    return Boolean(text && (
      text.includes('позицион') ||
      text.includes('position funnel') ||
      text.includes('дневные строки') ||
      text.includes('wb · position') ||
      text.includes('wb - position')
    ));
  }

  function normalizeAlias(value) {
    return cleanText(value).toLowerCase();
  }

  function positiveNumber(...values) {
    for (const value of values) {
      const number = Number(value);
      if (Number.isFinite(number) && number > 0) return number;
    }
    return null;
  }

  function fetchJsonNoStore(url) {
    return fetch(`${url}?_=${Date.now()}`, { cache: 'no-store' }).then((response) => {
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      return response.json();
    });
  }

  function buildFallbackDataCache(leaderboardPayload, funnelPayload) {
    const byAlias = new Map();
    const entries = new Map();

    const ensureEntry = (item) => {
      const canonical = normalizeAlias(item?.articleKey || item?.article || item?.nmId || item?.name || '');
      if (!canonical) return null;
      if (!entries.has(canonical)) entries.set(canonical, { key: canonical, leaderboard: null, funnel: null, aliases: new Set() });
      return entries.get(canonical);
    };

    const addAliases = (entry, item) => {
      [
        item?.articleKey,
        item?.article,
        item?.nmId,
        item?.name
      ].forEach((value) => {
        const alias = normalizeAlias(value);
        if (!alias || alias.length < 4) return;
        entry.aliases.add(alias);
        byAlias.set(alias, entry);
      });
    };

    (Array.isArray(leaderboardPayload?.items) ? leaderboardPayload.items : []).forEach((item) => {
      const entry = ensureEntry(item);
      if (!entry) return;
      entry.leaderboard = item;
      addAliases(entry, item);
    });

    (Array.isArray(funnelPayload?.items) ? funnelPayload.items : []).forEach((item) => {
      const entry = ensureEntry(item);
      if (!entry) return;
      entry.funnel = item;
      addAliases(entry, item);
    });

    const aliases = Array.from(byAlias.keys()).sort((left, right) => right.length - left.length);
    return { aliases, byAlias };
  }

  function loadFallbackDataCache() {
    if (fallbackDataPromise) return fallbackDataPromise;
    fallbackDataPromise = Promise.allSettled([
      fetchJsonNoStore('data/product_leaderboard.json'),
      fetchJsonNoStore('data/wb_sales_funnel_report.json')
    ]).then((results) => {
      const leaderboard = results[0].status === 'fulfilled' ? results[0].value : null;
      const funnel = results[1].status === 'fulfilled' ? results[1].value : null;
      return buildFallbackDataCache(leaderboard, funnel);
    }).catch((error) => {
      console.warn('[table-filters] kpi fallback data', error);
      return { aliases: [], byAlias: new Map() };
    });
    return fallbackDataPromise;
  }

  function resolveVisibleArticle(root, cache) {
    const text = normalizeAlias(root?.textContent || '');
    if (!text) return null;
    for (const alias of cache.aliases) {
      if (text.includes(alias)) return cache.byAlias.get(alias) || null;
    }
    return null;
  }

  function metricFallbackForLabel(label, entry) {
    const text = normalizeAlias(label);
    const leaderboard = entry?.leaderboard || {};
    const funnel = entry?.funnel || {};
    const pick = (kind, ...pairs) => {
      for (const pair of pairs) {
        const value = Number(pair[1]);
        if (Number.isFinite(value) && value > 0) return { value, source: pair[0], kind };
      }
      return null;
    };

    if (text.includes('достав')) return null;
    if (text.includes('показ') || text.includes('охват') || text.includes('view') || text.includes('reach') || text.includes('impression')) {
      return pick('count', ['product_leaderboard.json', leaderboard.reach], ['wb_sales_funnel_report.json', funnel.views]);
    }
    if (text.includes('клик') || text.includes('click')) {
      return pick('count', ['product_leaderboard.json', leaderboard.clicks], ['wb_sales_funnel_report.json', funnel.clicks]);
    }
    if (text.includes('корзин') || text.includes('cart')) {
      return pick('count', ['product_leaderboard.json', leaderboard.carts], ['wb_sales_funnel_report.json', funnel.carts]);
    }
    if (text.includes('заказ') || text.includes('order')) {
      return pick('count', ['wb_sales_funnel_report.json', funnel.ordersUnits], ['product_leaderboard.json', leaderboard.orders]);
    }
    if (text.includes('выкуп') || text.includes('buyout') || text.includes('buy')) {
      return pick('count', ['product_leaderboard.json', leaderboard.buys], ['wb_sales_funnel_report.json', funnel.buyoutsUnits]);
    }
    if (text.includes('оборот') || text.includes('выруч') || text.includes('revenue')) {
      return pick('currency', ['wb_sales_funnel_report.json', funnel.ordersRevenue], ['product_leaderboard.json', leaderboard.revenue]);
    }
    if (text.includes('марж') || text.includes('margin')) {
      return pick('currency', ['wb_sales_funnel_report.json', funnel.estimatedMargin], ['product_leaderboard.json', leaderboard.income]);
    }
    return null;
  }

  function isZeroText(value) {
    const text = cleanText(value);
    if (!text || /^[-—]+$/.test(text)) return false;
    return parseNumber(text) === 0;
  }

  function formatFallbackValue(fallback) {
    const maximumFractionDigits = Number.isInteger(fallback.value) ? 0 : 1;
    const formatted = new Intl.NumberFormat('ru-RU', { maximumFractionDigits }).format(fallback.value);
    return fallback.kind === 'currency' ? `${formatted} ₽` : formatted;
  }

  function findZeroValueNode(card) {
    if (card.dataset.alteaKpiFallbackApplied === '1') return null;
    const leaves = Array.from(card.querySelectorAll('*'))
      .filter((node) => !node.children.length && cleanText(node.textContent || ''))
      .sort((left, right) => cleanText(left.textContent || '').length - cleanText(right.textContent || '').length);
    return leaves.find((node) => node.dataset.alteaKpiFallbackApplied !== '1' && isZeroText(node.textContent || '')) || null;
  }

  function candidateKpiCards(root) {
    return Array.from(root.querySelectorAll('[class*="card"],[class*="kpi"],[class*="metric"],[class*="stat"],article'))
      .filter((node) => !node.closest('table,.altea-table-statebar,.altea-filter-popover,.altea-cell-detail-popover'))
      .map((node) => ({ node, text: cleanText(node.innerText || node.textContent || '') }))
      .filter((item) => item.text.length >= 2 && item.text.length <= 260 && item.text.includes('0'))
      .sort((left, right) => left.text.length - right.text.length)
      .map((item) => item.node);
  }

  function applyKpiFallback(card, fallback) {
    const valueNode = findZeroValueNode(card);
    if (!valueNode) return false;
    valueNode.textContent = formatFallbackValue(fallback);
    valueNode.dataset.alteaKpiFallbackApplied = '1';
    card.dataset.alteaKpiFallbackApplied = '1';
    card.classList.add('altea-kpi-fallback-card');
    let note = card.querySelector(':scope > .altea-kpi-fallback-note');
    if (!note) {
      note = document.createElement('span');
      note.className = 'altea-kpi-fallback-note';
      card.appendChild(note);
    }
    note.textContent = fallback.source;
    return true;
  }

  async function repairIuDrrKpiFallbacks() {
    const root = activeIuDrrRoot();
    if (!root || !looksLikePositionFunnel(root)) return 0;
    const cache = await loadFallbackDataCache();
    const entry = resolveVisibleArticle(root, cache);
    if (!entry) return 0;
    let patched = 0;
    candidateKpiCards(root).forEach((card) => {
      const fallback = metricFallbackForLabel(card.innerText || card.textContent || '', entry);
      if (!fallback) return;
      if (applyKpiFallback(card, fallback)) patched += 1;
    });
    return patched;
  }

  function scheduleIuDrrKpiRepair() {
    window.clearTimeout(kpiRepairTimer);
    kpiRepairTimer = window.setTimeout(() => {
      kpiRepairTimer = 0;
      repairIuDrrKpiFallbacks();
    }, 180);
  }

  function mutationNodeLooksRelevant(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.closest?.('.altea-filter-popover,.altea-cell-detail-popover,.altea-table-statebar')) return false;
    if (node.matches?.('table,thead,tbody,tr,th,td,.view,.modal,[class*="table"],[class*="matrix"],[class*="funnel"]')) return true;
    return Boolean(node.querySelector?.('table,thead,tbody,tr,th,td,[class*="table"],[class*="matrix"],[class*="funnel"]'));
  }

  function mutationListLooksRelevant(mutations) {
    return mutations.some((mutation) => {
      if (mutation.type !== 'childList') return false;
      return Array.from(mutation.addedNodes || []).some(mutationNodeLooksRelevant);
    });
  }

  function onDomMutations(mutations) {
    if (!mutationListLooksRelevant(mutations)) return;
    scheduleLazyRouteEnhance();
    scheduleIuDrrKpiRepair();
  }

  function attachDomObserver() {
    if (domObserver || typeof MutationObserver !== 'function') return;
    const target = document.querySelector('.main') || document.body;
    if (!target) return;
    domObserver = new MutationObserver(onDomMutations);
    domObserver.observe(target, { childList: true, subtree: true });
  }

  function controllerFromStatebar(target) {
    return target.closest('.altea-table-statebar')?.__alteaTableController || null;
  }

  function stopHeaderClick(event) {
    event.preventDefault();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    else event.stopPropagation();
  }

  function shouldSortFromHeaderClick(event) {
    return Boolean(event.shiftKey || event.altKey || event.ctrlKey || event.metaKey);
  }

  function openHeaderPopover(th, event) {
    const controller = ensureController(th?.closest('table'));
    const column = controller?.columnById(th?.dataset.alteaColumnId);
    if (!controller || !column) return false;
    stopHeaderClick(event);
    if (detailPopover) detailPopover.close();
    const anchor = th.querySelector(':scope > .altea-th-filter-btn') || th;
    getPopover().open(controller, column, anchor);
    return true;
  }

  function onDocumentClick(event) {
    const filterButton = event.target.closest('.altea-th-filter-btn');
    if (filterButton) {
      const th = filterButton.closest('th[data-altea-table-filter-col]');
      if (th) openHeaderPopover(th, event);
      return;
    }

    const removeFilter = event.target.closest('[data-altea-remove-filter]');
    if (removeFilter) {
      const controller = controllerFromStatebar(removeFilter);
      if (controller) controller.clearFilter(removeFilter.dataset.alteaRemoveFilter);
      return;
    }

    const removeSort = event.target.closest('[data-altea-remove-sort]');
    if (removeSort) {
      const controller = controllerFromStatebar(removeSort);
      if (controller) {
        controller.state.sort = controller.state.sort.filter((item) => item.columnId !== removeSort.dataset.alteaRemoveSort);
        controller.applyState({ persist: true });
      }
      return;
    }

    const resetFilters = event.target.closest('[data-altea-reset-filters]');
    if (resetFilters) {
      const controller = controllerFromStatebar(resetFilters);
      if (controller) controller.resetFilters();
      return;
    }

    const resetSort = event.target.closest('[data-altea-reset-sort]');
    if (resetSort) {
      const controller = controllerFromStatebar(resetSort);
      if (controller) controller.resetSort();
      return;
    }

    const th = event.target.closest('th[data-altea-table-filter-col]');
    if (th && !isInteractiveTarget(event.target)) {
      const controller = ensureController(th.closest('table'));
      if (controller && shouldSortFromHeaderClick(event)) {
        stopHeaderClick(event);
        controller.toggleSort(th.dataset.alteaColumnId, event.shiftKey);
      } else if (controller) {
        openHeaderPopover(th, event);
      }
      return;
    }

    const td = event.target.closest('td');
    if (td && !isInteractiveTarget(event.target) && !event.target.closest('.altea-filter-popover,.altea-cell-detail-popover')) {
      openCellDetail(td, event);
    }

    if (event.target.closest('.nav-btn, button, [role="button"], a, summary')) scheduleEnhance();
  }

  function onDocumentKeydown(event) {
    if (!['Enter', ' '].includes(event.key)) return;
    const th = event.target.closest?.('th[data-altea-table-filter-col]');
    if (!th) return;
    const controller = ensureController(th.closest('table'));
    if (!controller) return;
    if (shouldSortFromHeaderClick(event)) {
      event.preventDefault();
      controller.toggleSort(th.dataset.alteaColumnId, event.shiftKey);
      return;
    }
    openHeaderPopover(th, event);
  }

  function wrapRenderFunction(name) {
    const original = window[name];
    if (typeof original !== 'function' || original.__alteaTableFiltersWrapped) return;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      if (name === 'setView') scheduleLazyRouteEnhance();
      else scheduleEnhance();
      return result;
    };
    wrapped.__alteaTableFiltersWrapped = true;
    window[name] = wrapped;
  }

  function attach() {
    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('keydown', onDocumentKeydown);
    document.addEventListener('change', scheduleEnhance);
    document.addEventListener('input', () => {
      window.clearTimeout(inputDebounce);
      inputDebounce = window.setTimeout(scheduleEnhance, 110);
    });
    window.addEventListener('altea:viewchange', scheduleLazyRouteEnhance);
    window.addEventListener('altea:viewchange', scheduleIuDrrKpiRepair);
    window.addEventListener('load', scheduleEnhance);
    [
      'setView',
      'rerenderCurrentView',
      'renderPriceWorkbench',
      'renderProductLeaderboard',
      'renderSkuPlanFact',
      'renderOosControl',
      'renderDataHealth'
    ].forEach(wrapRenderFunction);
    attachDomObserver();
    scheduleEnhance();
    scheduleIuDrrKpiRepair();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach, { once: true });
  } else {
    attach();
  }

  window.AlteaTableController = TableController;
  window.AlteaTableHeaderFilters = {
    enhance: scheduleLazyRouteEnhance,
    repairIuDrrKpi: repairIuDrrKpiFallbacks
  };
})();
