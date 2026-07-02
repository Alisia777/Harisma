const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const OUTPUT_PATH = path.join(DATA_DIR, 'launches.json');
const SKUS_PATH = path.join(DATA_DIR, 'skus.json');

const MAIN_SHEET = 'Календарь новинок';
const GANTT_SHEET = 'Календарь новинок Гант';

function parseArgs(argv = []) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input-xlsx') {
      args.inputXlsx = argv[index + 1] || '';
      index += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const DEFAULT_WORKBOOK_NAME = fs.readdirSync(ROOT).find((name) => /Календарь новинок .*?\(\d+\)\.xlsx$/i.test(name))
  || 'Календарь новинок Алтея (2).xlsx';
const WORKBOOK_PATH = path.resolve(args.inputXlsx || process.env.ALTEA_LAUNCHES_XLSX || path.join(ROOT, DEFAULT_WORKBOOK_NAME));
const WORKBOOK_NAME = path.basename(WORKBOOK_PATH);

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeader(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\u0451/g, '\u0435')
    .replace(/[()]/g, ' ')
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLookup(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[ё]/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, '');
}

function normalizeLookupStable(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\u0451/g, '\u0435')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function normalizeKeyPart(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\u0451/g, '\u0435')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashShort(value) {
  return crypto.createHash('sha1').update(String(value || ''), 'utf8').digest('hex').slice(0, 10);
}

function slugifyIdPart(value) {
  const slug = normalizeText(value)
    .toLowerCase()
    .replace(/\u0451/g, '\u0435')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return slug || 'novinka';
}

function launchSourceKey(row = {}) {
  return [
    row.articleKey || '',
    row.name || '',
    row.reportGroup || '',
    row.subCategory || '',
    row.launchMonth || '',
    row.tag || '',
    row.skuBucket || ''
  ].map(normalizeKeyPart).join('|');
}

function launchId(row = {}) {
  const key = launchSourceKey(row);
  return `launch-${slugifyIdPart(row.articleKey || row.name)}-${hashShort(key)}`;
}

function tokenizeLookup(value) {
  return [...new Set(
    normalizeText(value)
      .toLowerCase()
      .replace(/\u0451/g, '\u0435')
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  )];
}

function tokenOverlapScore(leftValue, rightValue) {
  const leftTokens = tokenizeLookup(leftValue);
  const rightTokens = tokenizeLookup(rightValue);
  if (!leftTokens.length || !rightTokens.length) return 0;
  const rightSet = new Set(rightTokens);
  let matched = 0;
  leftTokens.forEach((token) => {
    if (rightSet.has(token)) matched += 1;
  });
  return matched / Math.max(leftTokens.length, rightTokens.length);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  if (!raw || raw === '#DIV/0!') return null;
  const compact = raw.replace(/\s+/g, '').replace(/[^\d,.-]/g, '');
  const lastDot = compact.lastIndexOf('.');
  const lastComma = compact.lastIndexOf(',');
  let normalized = compact;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandSep = decimalSep === '.' ? ',' : '.';
    normalized = compact
      .replace(new RegExp(`\\${thousandSep}`, 'g'), '')
      .replace(decimalSep, '.');
  } else if ((compact.match(/,/g) || []).length > 1) {
    normalized = compact.replace(/,/g, '');
  } else if ((compact.match(/\./g) || []).length > 1) {
    normalized = compact.replace(/\./g, '');
  } else if (lastComma >= 0) {
    normalized = compact.replace(',', '.');
  }
  const parsed = Number(normalized);
  if (Number.isFinite(parsed)) return parsed;
  const fallbackMatch = raw.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!fallbackMatch) return null;
  const fallback = Number(fallbackMatch[0]);
  return Number.isFinite(fallback) ? fallback : null;
}

const RU_MONTH_NUMBER = new Map([
  ['январь', 1], ['января', 1],
  ['февраль', 2], ['февраля', 2],
  ['март', 3], ['марта', 3],
  ['апрель', 4], ['апреля', 4],
  ['май', 5], ['мая', 5],
  ['июнь', 6], ['июня', 6],
  ['июль', 7], ['июля', 7],
  ['август', 8], ['августа', 8],
  ['сентябрь', 9], ['сентября', 9],
  ['октябрь', 10], ['октября', 10],
  ['ноябрь', 11], ['ноября', 11],
  ['декабрь', 12], ['декабря', 12]
]);

function launchMonthYear(value) {
  const match = normalizeText(value).match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : 2026;
}

function toIsoDate(year, month, day) {
  const parsedYear = Number(year);
  const parsedMonth = Number(month);
  const parsedDay = Number(day);
  if (!parsedYear || !parsedMonth || !parsedDay) return '';
  const date = new Date(Date.UTC(parsedYear, parsedMonth - 1, parsedDay));
  if (
    date.getUTCFullYear() !== parsedYear
    || date.getUTCMonth() !== parsedMonth - 1
    || date.getUTCDate() !== parsedDay
  ) {
    return '';
  }
  return `${parsedYear}-${String(parsedMonth).padStart(2, '0')}-${String(parsedDay).padStart(2, '0')}`;
}

function extractStageDueDate(value, launchMonth = '') {
  const raw = normalizeText(value);
  if (!raw) return '';

  const numeric = raw.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (numeric) {
    const year = numeric[3]
      ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3])
      : launchMonthYear(launchMonth);
    return toIsoDate(year, numeric[2], numeric[1]);
  }

  const lower = raw.toLowerCase().replace(/\u0451/g, '\u0435');
  const wordMonth = lower.match(/\b(\d{1,2})\s+([а-я]+)\b/u);
  if (wordMonth) {
    const month = RU_MONTH_NUMBER.get(wordMonth[2]);
    if (month) return toIsoDate(launchMonthYear(launchMonth), month, wordMonth[1]);
  }

  return '';
}

function normalizeStageStatus(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  const lower = raw.toLowerCase().replace(/\u0451/g, '\u0435');
  if (/не\s+начат/.test(lower)) return 'не начато';
  if (/готов|отгрузил|запущен|запущено/.test(lower)) return 'готово';
  if (/блок|стоп|оттяг|риск|проблем|завис/.test(lower)) return 'блокер';
  if (/работ|начат|ждем|ждём|заказ|образец|тз|производ|процесс|отгруз|ос от|до\s+\d/.test(lower)) return 'в работе';
  return raw;
}

function normalizeStageComment(value, status, dueDate) {
  const raw = normalizeText(value);
  if (!raw) return '';
  const lower = raw.toLowerCase().replace(/\u0451/g, '\u0435');
  const plainStatus = normalizeText(status).toLowerCase().replace(/\u0451/g, '\u0435');
  if (lower === plainStatus && !dueDate) return '';
  return raw;
}

function stageFields(value, launchMonth = '') {
  const status = normalizeStageStatus(value);
  const due = extractStageDueDate(value, launchMonth);
  return {
    status,
    due,
    comment: normalizeStageComment(value, status, due)
  };
}

function loadWorkbook() {
  if (!fs.existsSync(WORKBOOK_PATH)) {
    throw new Error(`Workbook not found: ${WORKBOOK_PATH}`);
  }
  return XLSX.readFile(WORKBOOK_PATH, { cellDates: true });
}

function loadSkus() {
  if (!fs.existsSync(SKUS_PATH)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(SKUS_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildSkuLookup(skus) {
  const lookup = new Map();

  function push(key, sku) {
    const normalized = normalizeLookupStable(key);
    if (!normalized || lookup.has(normalized)) return;
    lookup.set(normalized, sku);
  }

  skus.forEach((sku) => {
    push(sku?.articleKey, sku);
    push(sku?.article, sku);
    push(sku?.sku, sku);
    push(sku?.name, sku);
    push(`${sku?.name || ''} ${sku?.category || ''}`, sku);
  });

  return lookup;
}

function matchSku(lookup, row) {
  const candidates = [
    row.name,
    `${row.name} ${row.subCategory}`,
    `${row.name} ${row.reportGroup}`,
    row.characteristic
  ];

  for (const candidate of candidates) {
    const direct = lookup.get(normalizeLookupStable(candidate));
    if (direct) return direct;
  }

  const nameKey = normalizeLookupStable(row.name);
  if (!nameKey) return null;

  for (const sku of lookup.values()) {
    const skuName = normalizeLookupStable(sku?.name);
    if (!skuName) continue;
    if (skuName.includes(nameKey) || nameKey.includes(skuName)) return sku;
  }

  return null;
}

function extractMonthPlan(headers, rowValues, startIndex, endIndex) {
  const plan = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    const label = normalizeText(headers[index]);
    if (!label) continue;
    plan.push({
      label,
      value: numberOrNull(rowValues[index])
    });
  }
  return plan;
}

function findHeaderIndex(headers, candidates, fallbackIndex = -1) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const normalizedCandidates = candidates.map(normalizeHeader).filter(Boolean);
  for (const candidate of normalizedCandidates) {
    const exact = normalizedHeaders.indexOf(candidate);
    if (exact >= 0) return exact;
  }
  for (const candidate of normalizedCandidates) {
    const loose = normalizedHeaders.findIndex((header) => header && (header.includes(candidate) || candidate.includes(header)));
    if (loose >= 0) return loose;
  }
  return fallbackIndex;
}

function lastHeaderIndex(headers) {
  for (let index = headers.length - 1; index >= 0; index -= 1) {
    if (normalizeText(headers[index])) return index;
  }
  return -1;
}

function columnLetter(index) {
  let number = index + 1;
  let label = '';
  while (number > 0) {
    const remainder = (number - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    number = Math.floor((number - 1) / 26);
  }
  return label;
}

function cellAddress(rowIndex, columnIndex) {
  return `${columnLetter(columnIndex)}${rowIndex + 1}`;
}

function extractRowSourceComments(sheet, headers, values, rowIndex) {
  const comments = [];
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
    const header = normalizeText(headers[columnIndex]);
    const address = cellAddress(rowIndex, columnIndex);
    const cell = sheet[address];
    if (Array.isArray(cell?.c)) {
      cell.c.forEach((comment) => {
        const text = normalizeText(comment?.t || comment?.text || '');
        if (!text) return;
        comments.push({
          cell: address,
          header,
          author: normalizeText(comment?.a || comment?.author || ''),
          text,
          source: 'cell-comment'
        });
      });
    }

    if (/коммент|comment|примеч|note/i.test(header)) {
      const text = normalizeText(values[columnIndex]);
      if (text) {
        comments.push({
          cell: address,
          header,
          author: '',
          text,
          source: 'comment-column'
        });
      }
    }
  }
  return comments;
}

function parseMainSheet(workbook, skuLookup) {
  const sheet = workbook.Sheets[MAIN_SHEET];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows.length) return [];
  const headers = rows[0];
  const columns = {
    reportGroup: findHeaderIndex(headers, ['Группа отчетности'], 0),
    tag: findHeaderIndex(headers, ['ТЕГ: база/ тренд', 'ТЕГ'], 1),
    skuBucket: findHeaderIndex(headers, ['SKU'], 2),
    launchMonth: findHeaderIndex(headers, ['Месяц запуска'], 3),
    status: findHeaderIndex(headers, ['Статус'], 4),
    negotiation: findHeaderIndex(headers, ['Переговоры'], 5),
    sample: findHeaderIndex(headers, ['Пробный образец'], 6),
    productionStage: findHeaderIndex(headers, ['Производство'], 7),
    packaging: findHeaderIndex(headers, ['Упаковка/документы', 'Упаковка документы'], 8),
    content: findHeaderIndex(headers, ['Карточка/SKU', 'Карточка SKU'], 9),
    launchReadiness: findHeaderIndex(headers, ['Запуск'], 10),
    production: findHeaderIndex(headers, ['Производство (тип)', 'Производство'], 5),
    productionName: findHeaderIndex(headers, ['Производство (название)'], -1),
    firstBatchQty: findHeaderIndex(headers, ['Заказ (1 партия, штук)', 'Заказ 1 партия штук'], -1),
    name: findHeaderIndex(headers, ['Название'], 6),
    subCategory: findHeaderIndex(headers, ['Суб категория', 'ПодКатегория'], 7),
    characteristic: findHeaderIndex(headers, ['Характеристика'], 8),
    launchCost: findHeaderIndex(headers, ['Стоимость запуска'], -1),
    targetCost: findHeaderIndex(headers, ['Целевая себестоимость'], 9),
    srcWithoutVat: findHeaderIndex(headers, ['СРЦ без НДС'], 10),
    srcWithVat: findHeaderIndex(headers, ['СРЦ с НДС'], 11),
    srcWithSpp28: findHeaderIndex(headers, ['СРЦ с СПП 28%'], 12),
    mrpDeltaPct: findHeaderIndex(headers, ['отклонение от МРЦ'], 13),
    rrpWithVat: findHeaderIndex(headers, ['РРЦ с НДС'], 14),
    mrpWithVat: findHeaderIndex(headers, ['МРЦ с НДС'], 15),
    marketplaces: findHeaderIndex(headers, ['Маркетплейсы'], 16),
    grossMarginPct: findHeaderIndex(headers, ['Валовая маржа, %'], 17),
    grossMarginRub: findHeaderIndex(headers, ['Валовая маржа, руб'], 18),
    revenueAnchor: findHeaderIndex(headers, ['Выручка, руб. (с НДС) без СПП', 'Выручка руб с НДС без СПП'], 19),
    yearlyPlanValue: findHeaderIndex(headers, ['Сумма по году штуки', 'Сумма по году'], 28)
  };
  const missingRequired = ['reportGroup', 'launchMonth', 'name'].filter((key) => columns[key] < 0);
  if (missingRequired.length) {
    throw new Error(`Missing launch sheet columns: ${missingRequired.join(', ')}`);
  }

  const revenueStart = columns.revenueAnchor >= 0 ? columns.revenueAnchor + 1 : 20;
  const revenueEnd = columns.yearlyPlanValue >= 0 ? columns.yearlyPlanValue - 1 : 27;
  const launchStart = columns.yearlyPlanValue >= 0 ? columns.yearlyPlanValue + 1 : 29;
  const launchEnd = lastHeaderIndex(headers);
  const items = [];

  for (let index = 1; index < rows.length; index += 1) {
    const values = rows[index];
    const name = normalizeText(values[columns.name]);
    const reportGroup = normalizeText(values[columns.reportGroup]);
    const launchMonth = normalizeText(values[columns.launchMonth]);
    if (!name || !reportGroup || !launchMonth) continue;

    const row = {
      reportGroup,
      tag: normalizeText(values[columns.tag]),
      skuBucket: normalizeText(values[columns.skuBucket]),
      launchMonth,
      status: normalizeText(values[columns.status]),
      production: normalizeText(values[columns.production]),
      productionName: columns.productionName >= 0 ? normalizeText(values[columns.productionName]) : '',
      firstBatchQty: columns.firstBatchQty >= 0 ? numberOrNull(values[columns.firstBatchQty]) : null,
      name,
      subCategory: normalizeText(values[columns.subCategory]),
      characteristic: normalizeText(values[columns.characteristic]),
      launchCost: columns.launchCost >= 0 ? numberOrNull(values[columns.launchCost]) : null,
      targetCost: numberOrNull(values[columns.targetCost]),
      srcWithoutVat: numberOrNull(values[columns.srcWithoutVat]),
      srcWithVat: numberOrNull(values[columns.srcWithVat]),
      srcWithSpp28: numberOrNull(values[columns.srcWithSpp28]),
      mrpDeltaPct: numberOrNull(values[columns.mrpDeltaPct]),
      rrpWithVat: numberOrNull(values[columns.rrpWithVat]),
      mrpWithVat: numberOrNull(values[columns.mrpWithVat]),
      marketplaces: normalizeText(values[columns.marketplaces]),
      grossMarginPct: numberOrNull(values[columns.grossMarginPct]),
      grossMarginRub: numberOrNull(values[columns.grossMarginRub]),
      revenueAnchor: numberOrNull(values[columns.revenueAnchor]),
      yearlyPlanValue: numberOrNull(values[columns.yearlyPlanValue]),
      monthlyRevenuePlan: extractMonthPlan(headers, values, revenueStart, revenueEnd),
      monthlyLaunchPlan: extractMonthPlan(headers, values, launchStart, launchEnd)
    };

    const negotiation = stageFields(values[columns.negotiation], launchMonth);
    const sample = stageFields(values[columns.sample], launchMonth);
    const productionStage = stageFields(values[columns.productionStage], launchMonth);
    const packaging = stageFields(values[columns.packaging], launchMonth);
    const content = stageFields(values[columns.content], launchMonth);
    const launchReadiness = stageFields(values[columns.launchReadiness], launchMonth);
    Object.assign(row, {
      negotiationStatus: negotiation.status,
      negotiationDue: negotiation.due,
      negotiationComment: negotiation.comment,
      sampleStatus: sample.status,
      sampleDue: sample.due,
      sampleComment: sample.comment,
      productionStatus: productionStage.status,
      productionDue: productionStage.due,
      productionComment: productionStage.comment,
      packagingStatus: packaging.status,
      packagingDue: packaging.due,
      packagingComment: packaging.comment,
      contentStatus: content.status,
      contentDue: content.due,
      contentComment: content.comment,
      launchReadinessStatus: launchReadiness.status,
      launchReadinessDue: launchReadiness.due,
      launchReadinessComment: launchReadiness.comment
    });
    const sourceComments = extractRowSourceComments(sheet, headers, values, index);
    if (sourceComments.length) {
      row.sourceComments = sourceComments;
      row.productComment = sourceComments.map((comment) => {
        const prefix = comment.header || comment.cell;
        const author = comment.author ? `${comment.author}: ` : '';
        return `${prefix}: ${author}${comment.text}`;
      }).join(' | ');
    }

    const matchedSku = matchSku(skuLookup, row);
    row.articleKey = matchedSku?.articleKey || '';
    row.article = matchedSku?.article || '';
    row.owner = matchedSku?.owner?.name || '';
    row.registryStatus = matchedSku?.status || '';
    row.segment = matchedSku?.segment || '';
    row.category = matchedSku?.category || row.subCategory;
    row.sourceRow = index + 1;
    row.id = launchId(row);
    items.push(row);
  }

  return items;
}

function dedupeItems(items) {
  const byKey = new Map();
  items.forEach((item) => {
    const key = launchSourceKey(item);
    if (!key.replace(/\|/g, '')) return;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      return;
    }

    const existingScore = Object.values(existing).filter((value) => normalizeText(value)).length;
    const score = Object.values(item).filter((value) => normalizeText(value)).length;
    if (score > existingScore) byKey.set(key, item);
  });
  return [...byKey.values()];
}

function parseGanttSheet(workbook) {
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[GANTT_SHEET], { header: 1, defval: '' });
  if (rows.length < 2) return [];

  const headers = rows[1];
  const ganttMonthColumns = [
    ...headers.slice(3, 15).map((label, offset) => ({ year: 2026, label: normalizeText(label), index: offset + 3 })),
    ...headers.slice(17, 29).map((label, offset) => ({ year: 2027, label: normalizeText(label), index: offset + 17 }))
  ].filter((item) => item.label);

  let currentCategory = '';
  let currentSubCategory = '';
  const items = [];

  for (let index = 2; index < rows.length; index += 1) {
    const values = rows[index];
    const category = normalizeText(values[0]);
    const subCategory = normalizeText(values[1]);
    const skuName = normalizeText(values[2]);

    if (category) currentCategory = category;
    if (subCategory) currentSubCategory = subCategory;
    if (!skuName) continue;

    const activeMonths = ganttMonthColumns
      .map((column) => {
        const value = numberOrNull(values[column.index]);
        return value && value > 0
          ? {
              year: column.year,
              label: column.label,
              monthKey: `${column.year}-${String(column.index < 15 ? column.index - 2 : column.index - 16).padStart(2, '0')}`,
              value
            }
          : null;
      })
      .filter(Boolean);

    items.push({
      category: currentCategory,
      subCategory: currentSubCategory,
      name: skuName,
      ganttMonths: activeMonths
    });
  }

  return items;
}

function attachGantt(items, ganttRows) {
  const ganttLookup = new Map();
  ganttRows.forEach((row) => {
    ganttLookup.set(normalizeLookupStable(`${row.name}|${row.subCategory}`), row);
    ganttLookup.set(normalizeLookupStable(row.name), row);
  });

  function findFuzzyGanttMatch(item) {
    let best = null;
    let second = null;
    ganttRows.forEach((row) => {
      const nameScore = tokenOverlapScore(item.name, row.name);
      if (!nameScore) return;
      const subScore = tokenOverlapScore(item.subCategory || item.category, row.subCategory || row.category);
      const score = nameScore + (subScore * 0.35);
      if (!best || score > best.score) {
        second = best;
        best = { row, score };
      } else if (!second || score > second.score) {
        second = { row, score };
      }
    });
    if (!best) return null;
    const gap = best.score - (second?.score || 0);
    if (best.score >= 0.95 && gap >= 0.15) return best.row;
    return null;
  }

  items.forEach((item) => {
    const gantt = ganttLookup.get(normalizeLookupStable(`${item.name}|${item.subCategory}`))
      || ganttLookup.get(normalizeLookupStable(item.name))
      || findFuzzyGanttMatch(item)
      || null;
    item.ganttMonths = gantt?.ganttMonths || [];
  });

  return items;
}

function buildOutput(items) {
  return items.map((item) => ({
    id: item.id,
    articleKey: item.articleKey,
    article: item.article,
    owner: item.owner,
    reportGroup: item.reportGroup,
    tag: item.tag,
    skuBucket: item.skuBucket,
    launchMonth: item.launchMonth,
    status: item.status,
    negotiationStatus: item.negotiationStatus,
    negotiationDue: item.negotiationDue,
    negotiationComment: item.negotiationComment,
    sampleStatus: item.sampleStatus,
    sampleDue: item.sampleDue,
    sampleComment: item.sampleComment,
    productionStatus: item.productionStatus,
    productionDue: item.productionDue,
    productionComment: item.productionComment,
    packagingStatus: item.packagingStatus,
    packagingDue: item.packagingDue,
    packagingComment: item.packagingComment,
    contentStatus: item.contentStatus,
    contentDue: item.contentDue,
    contentComment: item.contentComment,
    launchReadinessStatus: item.launchReadinessStatus,
    launchReadinessDue: item.launchReadinessDue,
    launchReadinessComment: item.launchReadinessComment,
    production: item.production,
    supplierName: item.productionName,
    factoryName: '',
    productionName: item.productionName,
    firstBatchQty: item.firstBatchQty,
    name: item.name,
    subCategory: item.subCategory,
    characteristic: item.characteristic,
    category: item.category,
    marketplaces: item.marketplaces,
    registryStatus: item.registryStatus,
    segment: item.segment,
    launchCost: item.launchCost,
    targetCost: item.targetCost,
    srcWithoutVat: item.srcWithoutVat,
    srcWithVat: item.srcWithVat,
    srcWithSpp28: item.srcWithSpp28,
    mrpDeltaPct: item.mrpDeltaPct,
    rrpWithVat: item.rrpWithVat,
    mrpWithVat: item.mrpWithVat,
    grossMarginPct: item.grossMarginPct,
    grossMarginRub: item.grossMarginRub,
    revenueAnchor: item.revenueAnchor,
    yearlyPlanValue: item.yearlyPlanValue,
    monthlyRevenuePlan: item.monthlyRevenuePlan,
    monthlyLaunchPlan: item.monthlyLaunchPlan,
    ganttMonths: item.ganttMonths,
    sourceComments: item.sourceComments || [],
    productComment: item.productComment || '',
    notes: item.firstBatchQty ? `Заказ 1 партия: ${item.firstBatchQty} шт.` : '',
    sourceRow: item.sourceRow,
    sourceFile: WORKBOOK_NAME
  }));
}

function main() {
  const workbook = loadWorkbook();
  const skuLookup = buildSkuLookup(loadSkus());
  const mainItems = parseMainSheet(workbook, skuLookup);
  const ganttRows = parseGanttSheet(workbook);
  const payload = buildOutput(attachGantt(dedupeItems(mainItems), ganttRows));
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`launches: ${payload.length} rows -> ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main();
