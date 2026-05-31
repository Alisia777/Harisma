#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const APPLY_ACTIONS = new Set(['alias', 'map', 'mapping', 'apply', 'active', 'алиас', 'связать']);
const IGNORE_ACTIONS = new Set(['ignore', 'ignored', 'skip', 'hide', 'mute', 'exclude', 'игнор', 'игнорировать', 'скрыть']);
const SKIP_ACTIONS = new Set(['', 'need_check', 'check', 'new_sku', 'новый sku', 'новый_ску', 'проверить']);

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    if (key === 'apply' || key === 'dry-run') {
      args[key] = true;
      continue;
    }
    const hasSeparateValue = inlineValue === undefined && argv[index + 1] && !String(argv[index + 1]).startsWith('--');
    args[key] = inlineValue !== undefined ? inlineValue : (hasSeparateValue ? argv[index + 1] : true);
    if (hasSeparateValue) index += 1;
  }
  return args;
}

function resolveOptions(args) {
  const root = process.cwd();
  return {
    input: path.resolve(args.input || path.join(root, 'data', 'api_sku_alias_review.csv')),
    skuAliasJson: path.resolve(args['sku-alias-json'] || path.join(root, 'data', 'sku_aliases.json')),
    skuIgnoreJson: path.resolve(args['sku-ignore-json'] || path.join(root, 'data', 'sku_alias_ignore.json')),
    skusJson: path.resolve(args['skus-json'] || path.join(root, 'data', 'skus.json')),
    report: path.resolve(args.report || path.join(root, 'exports', `sku_alias_import_report_${new Date().toISOString().slice(0, 10)}.json`)),
    apply: Boolean(args.apply) && !Boolean(args['dry-run'])
  };
}

function normalizeToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^a-zа-я0-9]+/gi, '');
}

function normalizeHeader(value) {
  return normalizeToken(value).replace(/sku/g, 'sku');
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function readRows(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Input file not found: ${filePath}`);
  const workbook = XLSX.readFile(filePath, { raw: false });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '', raw: false });
}

function rowValue(row, aliases) {
  const normalizedAliases = aliases.map(normalizeHeader);
  for (const [key, value] of Object.entries(row || {})) {
    if (normalizedAliases.includes(normalizeHeader(key))) return String(value ?? '').trim();
  }
  return '';
}

function normalizePlatform(value) {
  const raw = normalizeToken(value);
  if (!raw || raw === 'all' || raw === 'все') return 'all';
  if (['wb', 'wildberries'].includes(raw)) return 'wb';
  if (['oz', 'ozon'].includes(raw)) return 'ozon';
  if (['ya', 'ym', 'yandex', 'yandexmarket', 'ямаркет'].includes(raw)) return 'ya';
  if (['ga', 'goldapple', 'зя', 'золотоеяблоко'].includes(raw)) return 'goldapple';
  if (['letu', 'letual', 'летуаль'].includes(raw)) return 'letu';
  if (['mm', 'magnit', 'magnitmarket', 'магнитмаркет'].includes(raw)) return 'magnit';
  return raw;
}

function skuTokens(sku = {}) {
  return [
    sku.articleKey,
    sku.article,
    sku.sku,
    sku.vendorCode,
    sku.supplierArticle,
    sku.nmId,
    sku.nmID,
    sku.barcode
  ].map(normalizeToken).filter(Boolean);
}

function buildSkuLookup(skus = []) {
  const lookup = new Map();
  skus.forEach((sku) => {
    skuTokens(sku).forEach((token) => {
      if (!lookup.has(token)) lookup.set(token, sku);
    });
  });
  return lookup;
}

function readAliasPayload(filePath) {
  const payload = readJson(filePath, null);
  if (!payload) {
    return {
      schema: 'sku-api-aliases-v1',
      description: 'Local API SKU mappings imported from review files.',
      columns: ['target_sku', 'platform', 'api_sku', 'status', 'note'],
      aliases: []
    };
  }
  if (Array.isArray(payload)) return { schema: 'sku-api-aliases-v1', aliases: payload };
  payload.aliases = Array.isArray(payload.aliases) ? payload.aliases : [];
  return payload;
}

function readIgnorePayload(filePath) {
  const payload = readJson(filePath, null);
  if (!payload) {
    return {
      schema: 'sku-api-ignore-v1',
      description: 'API SKU values intentionally excluded from alias cleanup.',
      columns: ['platform', 'api_sku', 'status', 'note'],
      ignored: []
    };
  }
  if (Array.isArray(payload)) return { schema: 'sku-api-ignore-v1', ignored: payload };
  payload.ignored = Array.isArray(payload.ignored)
    ? payload.ignored
    : (Array.isArray(payload.ignores) ? payload.ignores : []);
  return payload;
}

function aliasKey(alias) {
  return [
    normalizeToken(alias.target_sku || alias.targetSku || alias.target || ''),
    normalizePlatform(alias.platform || 'all'),
    normalizeToken(alias.api_sku || alias.alias || alias.value || '')
  ].join('|');
}

function ignoreKey(ignore) {
  return [
    normalizePlatform(ignore.platform || 'all'),
    normalizeToken(ignore.api_sku || ignore.apiSku || ignore.alias || ignore.value || '')
  ].join('|');
}

function normalizeAction(value, targetSku) {
  const raw = String(value || '').trim().toLowerCase();
  if (APPLY_ACTIONS.has(raw)) return 'alias';
  if (IGNORE_ACTIONS.has(raw)) return 'ignore';
  if (!raw && targetSku) return 'alias';
  if (SKIP_ACTIONS.has(raw)) return raw || 'empty';
  return raw;
}

function buildDecisionsFromRows(rows, skuLookup) {
  const aliases = [];
  const ignores = [];
  const skipped = [];
  const errors = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const targetSku = rowValue(row, ['target_sku', 'target', 'portal_sku', 'main_sku', 'article_key', 'articleKey']);
    const apiSku = rowValue(row, ['api_sku', 'api_article', 'api', 'articleKey', 'article', 'source_sku', 'marketplace_sku']);
    const platform = normalizePlatform(rowValue(row, ['platform', 'marketplace', 'source_platform']) || 'all');
    const status = rowValue(row, ['status', 'active']) || 'active';
    const note = rowValue(row, ['note', 'comment', 'decision_comment']) || 'Imported from API SKU review';
    const action = normalizeAction(rowValue(row, ['action', 'decision', 'решение']), targetSku);

    if (!apiSku) {
      skipped.push({ rowNumber, reason: 'empty api_sku' });
      return;
    }
    if (action === 'ignore') {
      ignores.push({
        platform,
        api_sku: apiSku,
        status: 'ignored',
        note,
        updatedAt: new Date().toISOString()
      });
      return;
    }
    if (action !== 'alias') {
      skipped.push({ rowNumber, apiSku, action, reason: 'not an alias action' });
      return;
    }
    if (!targetSku) {
      errors.push({ rowNumber, apiSku, platform, reason: 'target_sku is required for alias action' });
      return;
    }
    const targetToken = normalizeToken(targetSku);
    const target = skuLookup.get(targetToken);
    if (!target) {
      errors.push({ rowNumber, apiSku, platform, targetSku, reason: 'target_sku not found in skus.json' });
      return;
    }

    aliases.push({
      target_sku: target.articleKey || target.article || targetSku,
      platform,
      api_sku: apiSku,
      status,
      note
    });
  });
  return { aliases, ignores, skipped, errors };
}

function writeReport(filePath, report) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const rows = readRows(options.input);
  const skus = readJson(options.skusJson, []);
  const skuLookup = buildSkuLookup(Array.isArray(skus) ? skus : []);
  const currentPayload = readAliasPayload(options.skuAliasJson);
  const currentIgnorePayload = readIgnorePayload(options.skuIgnoreJson);
  const existingKeys = new Set(currentPayload.aliases.map(aliasKey));
  const existingIgnoreKeys = new Set(currentIgnorePayload.ignored.map(ignoreKey));
  const result = buildDecisionsFromRows(rows, skuLookup);
  const newAliases = [];
  const newIgnores = [];
  const duplicates = [];
  const duplicateIgnores = [];

  result.aliases.forEach((alias) => {
    const key = aliasKey(alias);
    if (!normalizeToken(alias.api_sku) || existingKeys.has(key)) {
      duplicates.push(alias);
      return;
    }
    existingKeys.add(key);
    newAliases.push(alias);
  });
  result.ignores.forEach((ignore) => {
    const key = ignoreKey(ignore);
    if (!normalizeToken(ignore.api_sku) || existingIgnoreKeys.has(key)) {
      duplicateIgnores.push(ignore);
      return;
    }
    existingIgnoreKeys.add(key);
    newIgnores.push(ignore);
  });

  const report = {
    generatedAt: new Date().toISOString(),
    input: options.input,
    target: options.skuAliasJson,
    ignoreTarget: options.skuIgnoreJson,
    apply: options.apply,
    sourceRows: rows.length,
    candidateAliases: result.aliases.length,
    candidateIgnores: result.ignores.length,
    newAliases: newAliases.length,
    newIgnores: newIgnores.length,
    duplicates: duplicates.length,
    duplicateIgnores: duplicateIgnores.length,
    skipped: result.skipped.length,
    errors: result.errors.length,
    skippedRows: result.skipped.slice(0, 100),
    errorRows: result.errors.slice(0, 100),
    aliases: newAliases,
    ignores: newIgnores
  };

  if (options.apply && result.errors.length === 0 && newAliases.length) {
    currentPayload.aliases.push(...newAliases);
    currentPayload.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(options.skuAliasJson), { recursive: true });
    fs.writeFileSync(options.skuAliasJson, JSON.stringify(currentPayload, null, 2), 'utf8');
  }
  if (options.apply && result.errors.length === 0 && newIgnores.length) {
    currentIgnorePayload.ignored.push(...newIgnores);
    currentIgnorePayload.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(options.skuIgnoreJson), { recursive: true });
    fs.writeFileSync(options.skuIgnoreJson, JSON.stringify(currentIgnorePayload, null, 2), 'utf8');
  }

  writeReport(options.report, report);
  console.log(JSON.stringify({
    apply: options.apply,
    sourceRows: report.sourceRows,
    candidateAliases: report.candidateAliases,
    candidateIgnores: report.candidateIgnores,
    newAliases: report.newAliases,
    newIgnores: report.newIgnores,
    duplicates: report.duplicates,
    duplicateIgnores: report.duplicateIgnores,
    skipped: report.skipped,
    errors: report.errors,
    report: options.report,
    targetUpdated: Boolean(options.apply && result.errors.length === 0 && (newAliases.length || newIgnores.length))
  }, null, 2));

  if (result.errors.length) process.exitCode = 1;
}

main();
