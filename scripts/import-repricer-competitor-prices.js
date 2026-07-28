#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { normalizeKey } = require('./repricer-market-intelligence');

const TEMPLATE_COLUMNS = [
  'Площадка',
  'Наш артикул',
  'ID предложения конкурента',
  'Название конкурента',
  'Клиентская цена, ₽',
  'Сопоставимая цена за единицу, ₽',
  'В наличии',
  'Match score',
  'Штук в упаковке',
  'Валюта',
  'Дата наблюдения',
  'URL',
  'Источник'
];

function parseArgs(argv = process.argv) {
  const args = { command: 'import' };
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--') && index === 2) {
      args.command = token;
      continue;
    }
    if (!token.startsWith('--')) continue;
    const separator = token.indexOf('=');
    const key = token.slice(2, separator >= 0 ? separator : undefined);
    if (separator >= 0) {
      args[key] = token.slice(separator + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !String(next).startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/g, '');
}

function field(row = {}, aliases = []) {
  const normalized = row.__normalized || Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value])
  );
  for (const alias of aliases) {
    const value = normalized[normalizeHeader(alias)];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}

function number(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/\s/g, '').replace(',', '.').replace('%', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value) {
  const parsed = number(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function ratio(value) {
  const parsed = number(value);
  if (parsed === null) return null;
  const normalized = parsed > 1 ? parsed / 100 : parsed;
  return normalized >= 0 && normalized <= 1 ? normalized : null;
}

function boolean(value, fallback = true) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'да', 'есть', 'в наличии'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'нет', 'oos', 'не в наличии'].includes(normalized)) return false;
  return null;
}

function isoTimestamp(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'number' && value > 20000 && value < 100000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0)).toISOString();
    }
  }
  const stamp = Date.parse(String(value || ''));
  return Number.isFinite(stamp) ? new Date(stamp).toISOString() : '';
}

function normalizedRows(rows = []) {
  return rows.map((row) => ({
    ...row,
    __normalized: Object.fromEntries(
      Object.entries(row).map(([key, value]) => [normalizeHeader(key), value])
    )
  }));
}

function readInputRows(inputPath) {
  const extension = path.extname(inputPath).toLowerCase();
  if (extension === '.json') {
    const payload = readJson(inputPath, {});
    const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.rows) ? payload.rows : []);
    if (rows.some((row) => Array.isArray(row?.offers) || Array.isArray(row?.competitors))) {
      return rows.flatMap((row) => (row.offers || row.competitors || []).map((offer) => ({
        platform: row.platform,
        article_key: row.article_key || row.articleKey || row.article,
        observed_at: offer.observed_at || offer.observedAt || row.observed_at || row.observedAt || payload.generatedAt,
        source: offer.source || row.source,
        ...offer
      })));
    }
    return normalizedRows(rows);
  }
  const workbook = XLSX.readFile(inputPath, { cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => /конкур/i.test(name)) || workbook.SheetNames[0];
  if (!sheetName) return [];
  return normalizedRows(XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    raw: true,
    defval: null,
    blankrows: false
  }));
}

function parseOfferRow(row = {}, rowNumber = 0) {
  const platform = String(field(row, ['Площадка', 'platform', 'marketplace']) || '').trim().toLowerCase();
  const articleKey = String(field(row, ['Наш артикул', 'article_key', 'articleKey', 'Артикул', 'SKU']) || '').trim();
  const competitorId = String(field(row, [
    'ID предложения конкурента',
    'competitor_id',
    'competitorId',
    'offer_id',
    'product_id'
  ]) || '').trim();
  const seller = String(field(row, ['Название конкурента', 'competitor_name', 'seller_name', 'seller']) || '').trim();
  const clientPrice = positive(field(row, ['Клиентская цена, ₽', 'client_price', 'clientPrice', 'price']));
  const comparableUnitPrice = positive(field(row, [
    'Сопоставимая цена за единицу, ₽',
    'comparable_unit_price',
    'comparableUnitPrice'
  ]));
  const inStock = boolean(field(row, ['В наличии', 'in_stock', 'inStock']), true);
  const matchScore = ratio(field(row, ['Match score', 'match_score', 'matchScore', 'Сопоставимость']));
  const packUnits = positive(field(row, ['Штук в упаковке', 'pack_units', 'packUnits'])) || 1;
  const currency = String(field(row, ['Валюта', 'currency']) || 'RUB').trim().toUpperCase();
  const observedAt = isoTimestamp(field(row, ['Дата наблюдения', 'observed_at', 'observedAt', 'asOfDate']));
  const url = String(field(row, ['URL', 'url', 'product_url', 'offer_url']) || '').trim();
  const source = String(field(row, ['Источник', 'source', 'provider']) || '').trim();
  const errors = [];
  if (!['wb', 'ozon'].includes(platform)) errors.push('Площадка должна быть WB или Ozon');
  if (!articleKey || !normalizeKey(articleKey)) errors.push('Не заполнен наш артикул');
  if (!competitorId && !url) errors.push('Нужен ID предложения конкурента или URL');
  if (clientPrice === null && comparableUnitPrice === null) errors.push('Не заполнена положительная клиентская цена');
  if (matchScore === null) errors.push('Match score должен быть от 0 до 1 или от 0% до 100%');
  if (inStock === null) errors.push('Поле «В наличии» не распознано');
  if (currency !== 'RUB') errors.push('Поддерживается только RUB');
  if (!observedAt) errors.push('Дата наблюдения не распознана');
  if (packUnits !== 1 && comparableUnitPrice === null) {
    errors.push('Для упаковки больше 1 нужна сопоставимая цена за единицу');
  }
  return {
    row_number: rowNumber,
    platform,
    article_key: articleKey,
    normalized_article_key: normalizeKey(articleKey),
    offer: {
      competitor_id: competitorId,
      seller,
      client_price: clientPrice,
      comparable_unit_price: comparableUnitPrice,
      in_stock: inStock,
      match_score: matchScore,
      pack_units: packUnits,
      currency,
      observed_at: observedAt,
      url,
      source
    },
    errors
  };
}

function buildSnapshot(rows = [], options = {}) {
  const parsed = rows.map((row, index) => parseOfferRow(row, index + 2));
  const errorRows = parsed.filter((row) => row.errors.length);
  const allowPartial = options.allowPartial === true;
  const accepted = allowPartial ? parsed.filter((row) => !row.errors.length) : (errorRows.length ? [] : parsed);
  const groups = new Map();
  accepted.forEach((row) => {
    const key = `${row.platform}|${row.normalized_article_key}|${row.article_key.toLowerCase()}`;
    const group = groups.get(key) || {
      platform: row.platform,
      article_key: row.article_key,
      normalized_article_key: row.normalized_article_key,
      observed_at: '',
      source: '',
      offers: []
    };
    group.offers.push(row.offer);
    if (!group.observed_at || row.offer.observed_at > group.observed_at) group.observed_at = row.offer.observed_at;
    if (row.offer.source) group.source = row.offer.source;
    groups.set(key, group);
  });
  const generatedAt = isoTimestamp(options.generatedAt) || new Date().toISOString();
  return {
    payload: {
      schema: 'repricer-competitor-prices-v1',
      generatedAt,
      currency: 'RUB',
      summary: {
        input_rows: rows.length,
        accepted_rows: accepted.length,
        rejected_rows: errorRows.length,
        sku_platform_rows: groups.size,
        atomic_rejected: Boolean(errorRows.length && !allowPartial)
      },
      rows: [...groups.values()].sort((left, right) => (
        `${left.platform}|${left.normalized_article_key}`
          .localeCompare(`${right.platform}|${right.normalized_article_key}`)
      ))
    },
    errors: errorRows.map((row) => ({
      row_number: row.row_number,
      platform: row.platform,
      article_key: row.article_key,
      competitor_id: row.offer.competitor_id,
      errors: row.errors
    }))
  };
}

function recordAttempt(historyPayload = {}, attempt = {}) {
  const rows = Array.isArray(historyPayload?.attempts) ? historyPayload.attempts : [];
  return {
    schema: 'repricer-competitor-import-history-v1',
    generatedAt: attempt.imported_at || new Date().toISOString(),
    attempts: [attempt, ...rows].slice(0, 50)
  };
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeTemplate(outputPath) {
  const workbook = XLSX.utils.book_new();
  const inputSheet = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS]);
  inputSheet['!cols'] = TEMPLATE_COLUMNS.map((column) => ({ wch: Math.max(14, Math.min(34, column.length + 4)) }));
  XLSX.utils.book_append_sheet(workbook, inputSheet, 'Конкуренты');
  const instructions = [
    ['Поле', 'Правило'],
    ['Одна строка', 'Одно предложение конкурента для одного нашего артикула и площадки.'],
    ['Клиентская цена', 'Цена, которую видит покупатель сейчас, в рублях.'],
    ['Match score', '0–1 или 0–100%. В расчёт допускается не ниже 0,85.'],
    ['Упаковка', 'Если количество не равно 1, обязательно заполнить сопоставимую цену за единицу.'],
    ['Свежесть', 'Дата наблюдения обязательна; в расчёт допускаются данные не старше одного дня.'],
    ['Решение', 'Репрайсер требует минимум три сопоставимых предложения и использует медиану, не минимальную цену.']
  ];
  const instructionSheet = XLSX.utils.aoa_to_sheet(instructions);
  instructionSheet['!cols'] = [{ wch: 24 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(workbook, instructionSheet, 'Инструкция');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  XLSX.writeFile(workbook, outputPath, { compression: true });
}

function main() {
  const args = parseArgs();
  const dataDir = path.resolve(args['data-dir'] || 'data');
  if (args.command === 'template') {
    const outputPath = path.resolve(args.output || 'output/repricer-competitor-template.xlsx');
    writeTemplate(outputPath);
    console.log(JSON.stringify({ status: 'template_created', output: outputPath }, null, 2));
    return;
  }
  const inputPath = path.resolve(args.input || '');
  if (!args.input || !fs.existsSync(inputPath)) {
    throw new Error('Передайте существующий XLSX/CSV/JSON через --input.');
  }
  const outputPath = path.resolve(args.output || path.join(dataDir, 'repricer_competitor_prices.json'));
  const historyPath = path.resolve(args.history || path.join(dataDir, 'repricer_competitor_import_history.json'));
  const rows = readInputRows(inputPath);
  const result = buildSnapshot(rows, {
    allowPartial: args['allow-partial'] === true,
    generatedAt: args['as-of-date'] || ''
  });
  const importedAt = new Date().toISOString();
  const attempt = {
    id: `competitor-import:${Date.now()}`,
    imported_at: importedAt,
    input_file: path.basename(inputPath),
    status: result.errors.length && args['allow-partial'] !== true ? 'rejected_atomic' : 'accepted',
    ...result.payload.summary,
    errors: result.errors.slice(0, 100)
  };
  writeJson(historyPath, recordAttempt(readJson(historyPath, {}), attempt));
  if (result.errors.length && args['allow-partial'] !== true) {
    console.error(JSON.stringify({ status: attempt.status, history: historyPath, summary: result.payload.summary, errors: result.errors }, null, 2));
    process.exitCode = 1;
    return;
  }
  writeJson(outputPath, result.payload);
  console.log(JSON.stringify({ status: attempt.status, output: outputPath, history: historyPath, summary: result.payload.summary }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[competitor-import] ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  TEMPLATE_COLUMNS,
  buildSnapshot,
  boolean,
  field,
  isoTimestamp,
  normalizeHeader,
  parseArgs,
  parseOfferRow,
  ratio,
  readInputRows,
  recordAttempt,
  writeTemplate
};
