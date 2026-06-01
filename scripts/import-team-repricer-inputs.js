#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = process.cwd();
const DEFAULT_SOURCE_DIR = path.join(process.env.USERPROFILE || '', 'Downloads', 'Данные от команды');
const IMPORT_STAMP = new Date().toISOString();
const SOURCE_NOTE = 'team-repricer-inputs-2026-06-01';

const OWNER_PLATFORM_COLUMNS = {
  ozon: 'Ответственный Ozon',
  wb: 'Ответственный ВБ',
  ym: 'Ответственный ЯМ',
  letu: 'Ответственный Летуаль',
  goldapple: 'Ответственный ЗЯ',
  magnit: 'Ответственный Магнит'
};

const OWNER_SKU_KEYS = ['articleKey', 'article', 'sku', 'vendorCode'];
const PRICE_FILES = [
  { path: 'data/smart_price_workbench.json' },
  { path: 'data/smart_price_overlay.json' },
  { path: 'data/prices.json' },
  { path: 'data/price_workbench_support.json' },
  { path: 'data/price_workbench_support.compact.json', format: 'compact' },
  { path: 'data/price_workbench_support.dashboard-compact.json', format: 'compact' },
  { path: 'data/price_workbench_support.minified.full.json', format: 'compact' }
];

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const hasValue = inlineValue !== undefined || (argv[index + 1] && !String(argv[index + 1]).startsWith('--'));
    if (!hasValue) {
      args[key] = true;
      continue;
    }
    args[key] = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
  }
  return args;
}

function normalizeToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function normalizeArticleKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  let raw = String(value || '').trim();
  if (!raw) return null;
  raw = raw.replace(/\s+/g, '').replace(/[^\d,.\-]/g, '');
  if (!raw) return null;
  const commaCount = (raw.match(/,/g) || []).length;
  const dotCount = (raw.match(/\./g) || []).length;
  if (commaCount && dotCount) {
    raw = raw.lastIndexOf(',') > raw.lastIndexOf('.')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
  } else if (commaCount) {
    const parts = raw.split(',');
    raw = parts.length > 1 && /^\d{3}$/.test(parts[parts.length - 1] || '')
      ? parts.join('')
      : raw.replace(',', '.');
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanOwner(value = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const normalized = text.toLowerCase();
  const known = new Map([
    ['александр', 'Питайкин Артём'],
    ['александр озон', 'Питайкин Артём'],
    ['артем', 'Питайкин Артём'],
    ['артём', 'Питайкин Артём'],
    ['питайкин артем', 'Питайкин Артём'],
    ['питайкин артём', 'Питайкин Артём'],
    ['дария', 'Молодякова Дария'],
    ['дарья', 'Молодякова Дария'],
    ['даша', 'Молодякова Дария'],
    ['молодякова дария', 'Молодякова Дария'],
    ['молодякова дарья', 'Молодякова Дария'],
    ['анна', 'Пирогова Анна'],
    ['анна пирогова', 'Пирогова Анна'],
    ['пирогова анна', 'Пирогова Анна'],
    ['екатерина', 'Доможирова Екатерина'],
    ['екатерина доброжирова', 'Доможирова Екатерина'],
    ['екатерина доможирова', 'Доможирова Екатерина'],
    ['доможирова екатерина', 'Доможирова Екатерина'],
    ['доброжирова екатерина', 'Доможирова Екатерина'],
    ['мария', 'Васильева Мария'],
    ['мария васильева', 'Васильева Мария'],
    ['мария васильевна', 'Васильева Мария'],
    ['васильева мария', 'Васильева Мария'],
    ['максим', 'Лапыгин Максим'],
    ['лапыгин максим', 'Лапыгин Максим'],
    ['максим лапыгин', 'Лапыгин Максим']
  ]);
  return known.get(normalized) || text;
}

function cleanOwnerForPlatform(value = '', platformKey = '', currentOwner = '') {
  const owner = cleanOwner(value);
  if (!owner) return '';
  const current = cleanOwner(currentOwner);
  if (platformKey === 'wb') {
    if (owner === 'Васильева Мария' || owner === 'Лапыгин Максим') return owner;
    if ((current === 'Васильева Мария' || current === 'Лапыгин Максим') && ['Кирилл', 'Олеся', 'Светлана'].includes(owner)) return current;
  }
  if (platformKey === 'ym') return 'Пирогова Анна';
  if (platformKey === 'goldapple' || platformKey === 'letu' || platformKey === 'magnit') return 'Доможирова Екатерина';
  return owner;
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, value, format = 'pretty') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const text = format === 'compact' ? JSON.stringify(value) : `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(filePath, text, 'utf8');
}

function sheetRows(filePath, options = {}) {
  const workbook = XLSX.readFile(filePath, { raw: false });
  const sheetName = options.sheetName || workbook.SheetNames[options.sheetIndex || 0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: options.header || undefined,
    defval: '',
    raw: false
  });
}

function findFile(sourceDir, matcher) {
  const files = fs.readdirSync(sourceDir).filter((name) => /\.xlsx$/i.test(name));
  const hit = files.find(matcher);
  if (!hit) throw new Error(`Не найден файл в ${sourceDir}`);
  return path.join(sourceDir, hit);
}

function resolveFiles(sourceDir) {
  return {
    zya: findFile(sourceDir, (name) => /SKU\s+ЗЯ/i.test(name)),
    letu: findFile(sourceDir, (name) => /SKU\s+Лэтуаль/i.test(name)),
    magnit: findFile(sourceDir, (name) => /SKU\s+ММ/i.test(name)),
    ym: findFile(sourceDir, (name) => /SKU\s+ЯМ/i.test(name)),
    wbMinMax: findFile(sourceDir, (name) => /Мин\s+макс\s+ВБ/i.test(name)),
    commonMinMax: findFile(sourceDir, (name) => /^Мин\s+максы/i.test(name)),
    ozonMinMax: findFile(sourceDir, (name) => /Озон\s+мин_макс/i.test(name)),
    owners: findFile(sourceDir, (name) => /^ответственные/i.test(name))
  };
}

function skuLookup(skus = []) {
  const lookup = new Map();
  skus.forEach((sku) => {
    OWNER_SKU_KEYS.forEach((key) => {
      const token = normalizeToken(sku?.[key]);
      if (token && !lookup.has(token)) lookup.set(token, sku);
    });
  });
  return lookup;
}

function rowValuesByIndex(filePath, sheetIndex = 0) {
  const rows = sheetRows(filePath, { sheetIndex, header: 1 });
  return rows.slice(1).filter((row) => row.some((value) => String(value || '').trim()));
}

function buildOwnerMaps(files) {
  const master = new Map();
  const platform = {
    wb: new Map(),
    ozon: new Map(),
    ym: new Map(),
    goldapple: new Map(),
    letu: new Map(),
    magnit: new Map()
  };

  sheetRows(files.owners).forEach((row) => {
    const sku = String(row.SKU || '').trim();
    if (!sku) return;
    const owners = {};
    Object.entries(OWNER_PLATFORM_COLUMNS).forEach(([platformKey, column]) => {
      owners[platformKey] = cleanOwner(row[column]);
      if (owners[platformKey]) platform[platformKey].set(normalizeToken(sku), owners[platformKey]);
    });
    master.set(normalizeToken(sku), {
      sku,
      status: String(row['Статус товара'] || '').trim(),
      brand: String(row['Бренд'] || '').trim(),
      category: String(row['Категория 1'] || '').trim(),
      owners
    });
  });

  rowValuesByIndex(files.zya).forEach((row) => {
    const sku = String(row[1] || '').trim();
    const owner = cleanOwner(row[4]);
    if (sku && owner) platform.goldapple.set(normalizeToken(sku), owner);
  });
  rowValuesByIndex(files.letu).forEach((row) => {
    const sku = String(row[1] || '').trim();
    const owner = cleanOwner(row[3]);
    if (sku && owner) platform.letu.set(normalizeToken(sku), owner);
  });
  rowValuesByIndex(files.magnit, 1).forEach((row) => {
    const sku = String(row[0] || '').trim();
    const owner = cleanOwner(row[4]);
    if (sku && owner) platform.magnit.set(normalizeToken(sku), owner);
  });
  rowValuesByIndex(files.ym).forEach((row) => {
    const sku = String(row[0] || '').trim();
    const owner = cleanOwner(row[1]);
    if (sku && owner) platform.ym.set(normalizeToken(sku), owner);
  });

  return { master, platform };
}

function ensureOwnerObject(sku) {
  if (!sku.owner || typeof sku.owner !== 'object' || Array.isArray(sku.owner)) {
    sku.owner = { name: cleanOwner(sku.owner), source: '', byPlatform: {} };
  }
  sku.owner.byPlatform = sku.owner.byPlatform && typeof sku.owner.byPlatform === 'object'
    ? sku.owner.byPlatform
    : {};
  sku.ownersByPlatform = sku.ownersByPlatform && typeof sku.ownersByPlatform === 'object'
    ? sku.ownersByPlatform
    : {};
}

function ownerForPlatform(ownerMaps, articleKey, platformKey) {
  const token = normalizeToken(articleKey);
  const master = ownerMaps.master.get(token);
  const normalizedPlatform = platformKey === 'ya' ? 'ym' : platformKey;
  const owner = master?.owners?.[normalizedPlatform]
    || ownerMaps.platform[normalizedPlatform]?.get(token)
    || '';
  return cleanOwner(owner);
}

function updateSkuOwners(skus, ownerMaps) {
  const stats = { touched: 0, platformAssignments: 0 };
  skus.forEach((sku) => {
    const token = normalizeToken(sku.articleKey || sku.article);
    const master = ownerMaps.master.get(token);
    if (!master) return;
    ensureOwnerObject(sku);
    ['wb', 'ozon', 'ym', 'goldapple', 'letu', 'magnit'].forEach((platformKey) => {
      const localKey = platformKey === 'goldapple' ? 'ga' : (platformKey === 'magnit' ? 'mm' : platformKey);
      const owner = cleanOwnerForPlatform(
        master.owners[platformKey] || ownerMaps.platform[platformKey]?.get(token),
        platformKey,
        sku.ownersByPlatform?.[localKey] || sku.owner?.byPlatform?.[localKey] || ''
      );
      if (!owner) return;
      sku.owner.byPlatform[localKey] = owner;
      sku.ownersByPlatform[localKey] = owner;
      stats.platformAssignments += 1;
    });
    const primaryOwner = cleanOwner(master.owners.wb || master.owners.ozon || master.owners.ym || sku.owner.name);
    if (primaryOwner) sku.owner.name = primaryOwner;
    sku.owner.source = `${SOURCE_NOTE} · ${path.basename('ответственные_все_МП_без_алиасов_артикулов.xlsx')}`;
    if (master.status) {
      sku.status = master.status;
      sku.registryStatus = master.status;
    }
    if (master.brand) sku.brand = master.brand;
    if (master.category) sku.category = master.category;
    stats.touched += 1;
  });
  return stats;
}

function readAliasPayload(filePath) {
  const payload = readJson(filePath, {
    schema: 'sku-api-aliases-v1',
    aliases: [],
    columns: ['target_sku', 'platform', 'api_sku', 'status', 'note'],
    description: 'Local API SKU mappings imported from review files.'
  });
  payload.aliases = Array.isArray(payload.aliases) ? payload.aliases : [];
  return payload;
}

function aliasKey(row) {
  return [
    normalizeToken(row.target_sku || row.targetSku || row.target || ''),
    normalizeToken(row.platform || 'all'),
    normalizeToken(row.api_sku || row.apiSku || row.alias || row.value || '')
  ].join('|');
}

function addAlias(rows, seen, lookup, targetSku, platform, apiSku, note) {
  const targetToken = normalizeToken(targetSku);
  const apiText = String(apiSku || '').trim();
  if (!targetToken || !apiText) return false;
  const target = lookup.get(targetToken);
  if (!target) return false;
  if (normalizeToken(apiText) === normalizeToken(target.articleKey || target.article)) return false;
  const row = {
    target_sku: target.articleKey || target.article || targetSku,
    platform,
    api_sku: apiText,
    status: 'active',
    note,
    updatedAt: IMPORT_STAMP
  };
  const key = aliasKey(row);
  if (seen.has(key)) return false;
  seen.add(key);
  rows.push(row);
  return true;
}

function buildAliases(files, skus) {
  const lookup = skuLookup(skus);
  const payload = readAliasPayload(path.join(ROOT, 'data', 'sku_aliases.json'));
  const seen = new Set(payload.aliases.map(aliasKey));
  const newRows = [];

  rowValuesByIndex(files.zya).forEach((row) => {
    const targetSku = row[1];
    addAlias(newRows, seen, lookup, targetSku, 'goldapple', row[2], 'ЗЯ номенклатура');
    String(row[3] || '').split(/[,\s]+/).forEach((barcode) => addAlias(newRows, seen, lookup, targetSku, 'goldapple', barcode, 'ЗЯ штрихкод'));
  });

  rowValuesByIndex(files.letu).forEach((row) => {
    addAlias(newRows, seen, lookup, row[1], 'letu', row[0], 'Лэтуаль артикул Алькора');
  });

  rowValuesByIndex(files.magnit, 1).forEach((row) => {
    const targetSku = row[0];
    addAlias(newRows, seen, lookup, targetSku, 'magnit', row[1], 'Магнит Product ID');
    String(row[2] || '').split(/[,\s]+/).forEach((barcode) => addAlias(newRows, seen, lookup, targetSku, 'magnit', barcode, 'Магнит штрихкод'));
  });

  rowValuesByIndex(files.ym).forEach((row) => {
    const apiSku = String(row[0] || '').trim();
    if (!/^fbs[_-]/i.test(apiSku)) return;
    const targetSku = apiSku.replace(/^fbs[_-]/i, '');
    addAlias(newRows, seen, lookup, targetSku, 'ya', apiSku, 'Я.Маркет FBS alias');
  });

  payload.aliases.push(...newRows);
  payload.updatedAt = IMPORT_STAMP;
  payload.description = 'Local API SKU mappings imported from team SKU files and review files.';
  writeJson(path.join(ROOT, 'data', 'sku_aliases.json'), payload);
  return { added: newRows.length, total: payload.aliases.length, rows: newRows };
}

function readMinMaxRows(filePath, columns) {
  return rowValuesByIndex(filePath).map((row) => {
    const article = String(row[columns.article] || '').trim();
    const minPrice = parseNumber(row[columns.min]);
    const maxPrice = parseNumber(row[columns.max]);
    if (!article || minPrice === null || maxPrice === null) return null;
    return {
      article,
      token: normalizeToken(article),
      minPrice,
      maxPrice,
      source: path.basename(filePath)
    };
  }).filter(Boolean);
}

function buildMinMaxMaps(files) {
  const maps = {
    wb: new Map(),
    ozon: new Map(),
    generic: new Map()
  };
  readMinMaxRows(files.wbMinMax, { article: 0, min: 1, max: 2 }).forEach((row) => maps.wb.set(row.token, row));
  readMinMaxRows(files.ozonMinMax, { article: 0, min: 1, max: 2 }).forEach((row) => maps.ozon.set(row.token, row));
  readMinMaxRows(files.commonMinMax, { article: 0, min: 1, max: 2 }).forEach((row) => maps.generic.set(row.token, row));
  return maps;
}

function platformAliases(platformKey) {
  if (platformKey === 'ym') return ['ym', 'ya'];
  if (platformKey === 'ya') return ['ya', 'ym'];
  if (platformKey === 'goldapple' || platformKey === 'ga') return ['goldapple', 'ga'];
  if (platformKey === 'magnit' || platformKey === 'mm') return ['magnit', 'mm'];
  return [platformKey];
}

function platformOwnerKey(platformKey) {
  if (platformKey === 'ya') return 'ym';
  if (platformKey === 'ga') return 'goldapple';
  if (platformKey === 'mm') return 'magnit';
  return platformKey;
}

function rowTokens(row = {}, objectKey = '') {
  return [
    objectKey,
    row.articleKey,
    row.article,
    row.sku,
    row.vendorCode,
    row.offerId,
    row.sourceArticleKey
  ].map(normalizeToken).filter(Boolean);
}

function findCorrection(minMaxMaps, platformKey, row, objectKey) {
  const tokens = rowTokens(row, objectKey);
  for (const platform of platformAliases(platformKey)) {
    const map = minMaxMaps[platform];
    if (!map) continue;
    for (const token of tokens) {
      if (map.has(token)) return { ...map.get(token), platformSource: platform };
    }
  }
  for (const token of tokens) {
    if (minMaxMaps.generic.has(token)) return { ...minMaxMaps.generic.get(token), platformSource: 'generic' };
  }
  return null;
}

function rowsForBucket(bucket = {}) {
  const rows = bucket.rows;
  if (Array.isArray(rows)) return rows.map((row, index) => ({ row, objectKey: '', index }));
  if (rows && typeof rows === 'object') {
    return Object.entries(rows).map(([objectKey, row], index) => ({ row, objectKey, index }));
  }
  return [];
}

function applyMinMax(row, correction) {
  if (!correction) return false;
  const changed = row.minPrice !== correction.minPrice
    || row.maxPrice !== correction.maxPrice
    || row.workingZoneFrom !== correction.minPrice
    || row.workingZoneTo !== correction.maxPrice
    || row.manualMinPrice !== correction.minPrice
    || row.manualMaxPrice !== correction.maxPrice;
  if (!changed) return false;
  row.minMaxPrevious = {
    minPrice: row.minPrice ?? null,
    maxPrice: row.maxPrice ?? null,
    workingZoneFrom: row.workingZoneFrom ?? null,
    workingZoneTo: row.workingZoneTo ?? null,
    minMaxSource: row.minMaxSource ?? null
  };
  row.minPrice = correction.minPrice;
  row.maxPrice = correction.maxPrice;
  row.workingZoneFrom = correction.minPrice;
  row.workingZoneTo = correction.maxPrice;
  row.manualMinPrice = correction.minPrice;
  row.manualMaxPrice = correction.maxPrice;
  row.minMaxSource = correction.source;
  row.minMaxImportedAt = IMPORT_STAMP;
  return true;
}

function applyOwner(row, platformKey, ownerMaps) {
  const tokenCandidates = rowTokens(row);
  for (const token of tokenCandidates) {
    const master = ownerMaps.master.get(token);
    const owner = cleanOwnerForPlatform(
      master?.owners?.[platformOwnerKey(platformKey)] || ownerMaps.platform[platformOwnerKey(platformKey)]?.get(token),
      platformOwnerKey(platformKey),
      row.owner || ''
    );
    if (!owner) continue;
    if (row.owner === owner) return false;
    row.owner = owner;
    row.ownerSource = SOURCE_NOTE;
    return true;
  }
  return false;
}

function updatePriceFiles(ownerMaps, minMaxMaps) {
  const stats = {};
  PRICE_FILES.forEach((target) => {
    const relativePath = target.path;
    const filePath = path.join(ROOT, relativePath);
    const payload = readJson(filePath, null);
    if (!payload?.platforms) return;
    const fileStats = { ownerRows: 0, minMaxRows: 0 };
    Object.entries(payload.platforms).forEach(([platformKey, bucket]) => {
      rowsForBucket(bucket).forEach(({ row, objectKey }) => {
        if (!row || typeof row !== 'object') return;
        if (applyOwner(row, platformKey, ownerMaps)) fileStats.ownerRows += 1;
        const correction = findCorrection(minMaxMaps, platformKey, row, objectKey);
        if (applyMinMax(row, correction)) fileStats.minMaxRows += 1;
      });
    });
    payload.minMaxImportAppliedAt = IMPORT_STAMP;
    payload.minMaxImportSources = [
      'Мин макс ВБ 01.06.xlsx',
      'Озон мин_макс корр. 01.06.xlsx',
      'Мин максы.xlsx'
    ];
    payload.ownerImportAppliedAt = IMPORT_STAMP;
    payload.ownerImportSource = 'ответственные_все_МП_без_алиасов_артикулов.xlsx + SKU МП';
    writeJson(filePath, payload, target.format);
    stats[relativePath] = fileStats;
  });
  return stats;
}

function main() {
  const args = parseArgs(process.argv);
  const sourceDir = path.resolve(args['source-dir'] || DEFAULT_SOURCE_DIR);
  const files = resolveFiles(sourceDir);
  const skusPath = path.join(ROOT, 'data', 'skus.json');
  const skus = readJson(skusPath, []);
  const ownerMaps = buildOwnerMaps(files);
  const skuOwnerStats = updateSkuOwners(skus, ownerMaps);
  writeJson(skusPath, skus);

  const aliasStats = buildAliases(files, skus);
  const minMaxMaps = buildMinMaxMaps(files);
  const priceStats = updatePriceFiles(ownerMaps, minMaxMaps);

  const report = {
    generatedAt: IMPORT_STAMP,
    sourceDir,
    files: Object.fromEntries(Object.entries(files).map(([key, value]) => [key, path.basename(value)])),
    owners: {
      masterSku: ownerMaps.master.size,
      skuOwnerStats
    },
    aliases: aliasStats,
    minMax: {
      wb: minMaxMaps.wb.size,
      ozon: minMaxMaps.ozon.size,
      generic: minMaxMaps.generic.size
    },
    priceStats
  };
  const reportPath = path.join(ROOT, 'exports', `team-repricer-import-report-${IMPORT_STAMP.slice(0, 10)}.json`);
  writeJson(reportPath, report);
  console.log(JSON.stringify(report, null, 2));
}

main();
