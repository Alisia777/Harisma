#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const DISTRIBUTION_FILE_NAME = '\u0440\u0430\u0441\u043f\u0440\u0435\u0434\u0435\u043b\u0435\u043d\u0438\u0435 \u0430\u0440\u0442\u0438\u043a\u0443\u043b\u043e\u0432.xlsx';

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

function resolveOptions(args) {
  const root = process.cwd();
  const downloadCandidate = process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, 'Downloads', 'Telegram Desktop', DISTRIBUTION_FILE_NAME)
    : '';
  const candidates = [
    args['input-xlsx'],
    process.env.ALTEA_WB_OWNER_DISTRIBUTION_XLSX,
    path.join(root, DISTRIBUTION_FILE_NAME),
    downloadCandidate
  ].filter(Boolean);
  const inputXlsx = candidates.find((candidate) => fs.existsSync(candidate)) || '';
  return {
    inputXlsx,
    inputDir: path.resolve(args['input-dir'] || path.join(root, '.altea-google-sheet-sync-output')),
    baseDataDir: path.resolve(args['base-data-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || args['input-dir'] || path.join(root, '.altea-google-sheet-sync-output')),
    mirrorLocalFallback: Boolean(args['mirror-local-fallback']),
    clearMissingDistribution: Boolean(args['clear-missing-distribution'])
  };
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function readSnapshot(options, name, fallback = null) {
  return readJsonIfExists(path.join(options.inputDir, `${name}.json`))
    ?? readJsonIfExists(path.join(options.baseDataDir, `${name}.json`))
    ?? fallback;
}

function writeSnapshot(options, name, payload) {
  fs.mkdirSync(options.outputDir, { recursive: true });
  const outputPath = path.join(options.outputDir, `${name}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const mirrored = [];
  if (options.mirrorLocalFallback) {
    fs.mkdirSync(options.baseDataDir, { recursive: true });
    const mirrorPath = path.join(options.baseDataDir, `${name}.json`);
    fs.copyFileSync(outputPath, mirrorPath);
    mirrored.push(mirrorPath);
  }
  return { outputPath, mirrored };
}

function normalizeArticle(value) {
  return String(value ?? '')
    .replace(/\uFEFF/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function normalizeLoose(value) {
  return normalizeArticle(value)
    .replace(/\u0451/g, '\u0435')
    .replace(/[^\p{L}0-9]+/gu, '');
}

function normalizeOwner(value) {
  return String(value ?? '')
    .replace(/\uFEFF/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const OWNER_CANONICAL_NAMES = new Map([
  ['\u0430\u0440\u0442\u0435\u043c', '\u0410\u0440\u0442\u0435\u043c'],
  ['\u0430\u0440\u0442\u0451\u043c', '\u0410\u0440\u0442\u0435\u043c'],
  ['\u0434\u0430\u0440\u044c\u044f', '\u0414\u0430\u0448\u0430'],
  ['\u0434\u0430\u0448\u0430', '\u0414\u0430\u0448\u0430'],
  ['\u0435\u043a\u0430\u0442\u0435\u0440\u0438\u043d\u0430', '\u0415\u043a\u0430\u0442\u0435\u0440\u0438\u043d\u0430'],
  ['\u043a\u0438\u0440\u0438\u043b\u043b', '\u041a\u0438\u0440\u0438\u043b\u043b'],
  ['\u043a\u0441\u0435\u043d\u0438\u044f', '\u041a\u0441\u0435\u043d\u0438\u044f'],
  ['\u043c\u0430\u043a\u0441\u0438\u043c', '\u041c\u0430\u043a\u0441\u0438\u043c'],
  ['\u043c\u0430\u0440\u0438\u044f', '\u041c\u0430\u0440\u0438\u044f'],
  ['\u043e\u043b\u0435\u0441\u044f', '\u041e\u043b\u0435\u0441\u044f'],
  ['\u0441\u0432\u0435\u0442\u043b\u0430\u043d\u0430', '\u0421\u0432\u0435\u0442\u043b\u0430\u043d\u0430']
]);

const OWNER_NAME_ALIASES = new Map([
  ['\u0432\u0430\u0441\u0438\u043b\u044c\u0435\u0432\u0430 \u043c\u0430\u0440\u0438\u044f', '\u041c\u0430\u0440\u0438\u044f'],
  ['\u043c\u0430\u0440\u0438\u044f \u0432\u0430\u0441\u0438\u043b\u044c\u0435\u0432\u0430', '\u041c\u0430\u0440\u0438\u044f'],
  ['\u043b\u0430\u043f\u044b\u0433\u0438\u043d \u043c\u0430\u043a\u0441\u0438\u043c', '\u041c\u0430\u043a\u0441\u0438\u043c'],
  ['\u043c\u0430\u043a\u0441\u0438\u043c \u043b\u0430\u043f\u044b\u0433\u0438\u043d', '\u041c\u0430\u043a\u0441\u0438\u043c']
]);

function canonicalOwnerName(value = '') {
  const normalized = normalizeOwner(value);
  if (!normalized) return '';
  const lowered = normalized.toLowerCase();
  if (OWNER_NAME_ALIASES.has(lowered)) return OWNER_NAME_ALIASES.get(lowered);
  if (OWNER_CANONICAL_NAMES.has(lowered)) return OWNER_CANONICAL_NAMES.get(lowered);
  const [firstToken = ''] = normalized.split(' ');
  const firstTokenLowered = firstToken.toLowerCase();
  if (OWNER_CANONICAL_NAMES.has(firstTokenLowered)) return OWNER_CANONICAL_NAMES.get(firstTokenLowered);
  return normalized;
}

function normalizeHeader(value) {
  return normalizeOwner(value)
    .toLowerCase()
    .replace(/\u0451/g, '\u0435')
    .replace(/[^\p{L}0-9]+/gu, '');
}

function findDistributionColumns(rows = []) {
  const scanLimit = Math.min(rows.length, 10);
  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const headers = (rows[rowIndex] || []).map(normalizeHeader);
    const articleIndex = headers.findIndex((header) => (
      header === 'sku'
      || header === 'article'
      || header === 'articlekey'
      || header.includes('\u0430\u0440\u0442\u0438\u043a\u0443\u043b')
    ));
    const ownerIndex = headers.findIndex((header) => (
      header === 'ownerwb'
      || header === 'wbowner'
      || header === '\u0432\u0431owner'
      || header === 'ownerwildberries'
      || (
        header.includes('\u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d')
        && (
          header.includes('\u0432\u0431')
          || header.includes('wb')
          || header.includes('wildberries')
        )
      )
    ));
    if (articleIndex >= 0 && ownerIndex >= 0) {
      return { articleIndex, ownerIndex, headerRowIndex: rowIndex };
    }
  }
  return { articleIndex: 0, ownerIndex: 1, headerRowIndex: -1 };
}

function readDistribution(filePath) {
  if (!filePath) {
    return { rows: [], sheetName: '', duplicates: [], columns: { articleIndex: 0, ownerIndex: 1, headerRowIndex: -1 } };
  }
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false
  });
  const columns = findDistributionColumns(rows);
  const byArticle = new Map();
  const duplicates = [];
  rows.forEach((row, index) => {
    if (index === columns.headerRowIndex) return;
    const article = normalizeArticle(row[columns.articleIndex]);
    const owner = canonicalOwnerName(row[columns.ownerIndex]);
    if (!article || !owner) return;
    const payload = {
      sourceRow: index + 1,
      article,
      sourceArticle: String(row[columns.articleIndex] ?? '').trim(),
      owner
    };
    if (byArticle.has(article)) {
      const previousOwner = byArticle.get(article).owner;
      duplicates.push({ ...payload, previousOwner, conflict: previousOwner !== owner });
    }
    byArticle.set(article, payload);
  });
  return {
    sheetName,
    sourceRowCount: rows.length,
    rows: [...byArticle.values()],
    duplicates,
    columns
  };
}

function skuTokens(sku = {}) {
  const values = [
    sku.articleKey,
    sku.article,
    sku.sku,
    sku.vendorCode,
    sku.supplierArticle
  ];
  if (Array.isArray(sku.aliases)) {
    sku.aliases.forEach((alias) => {
      if (typeof alias === 'string') values.push(alias);
      else values.push(alias?.value, alias?.alias, alias?.sku, alias?.article, alias?.articleKey, alias?.offerId, alias?.vendorCode);
    });
  }
  Object.values(sku.platformAliases || {}).forEach((aliases) => {
    if (Array.isArray(aliases)) values.push(...aliases);
    else values.push(aliases);
  });
  return values.filter((value) => String(value ?? '').trim());
}

function buildSkuLookup(skus = []) {
  const exact = new Map();
  const loose = new Map();
  skus.forEach((sku) => {
    skuTokens(sku).forEach((token) => {
      const exactToken = normalizeArticle(token);
      const looseToken = normalizeLoose(token);
      if (exactToken && !exact.has(exactToken)) exact.set(exactToken, sku);
      if (looseToken && !loose.has(looseToken)) loose.set(looseToken, sku);
    });
  });
  return { exact, loose };
}

function wbOwnerOf(sku = {}) {
  return normalizeOwner(sku.ownersByPlatform?.wb || sku.owner?.byPlatform?.wb || '');
}

function isWbSku(sku = {}) {
  return Boolean(sku.wb || sku.flags?.hasWB || wbOwnerOf(sku));
}

function qualityIssueIndex(quality = {}) {
  const map = new Map();
  (quality.issues || []).forEach((issue) => {
    if (String(issue.platform || '').toLowerCase() !== 'wb') return;
    const key = normalizeArticle(issue.articleKey || issue.article || issue.api_sku || issue.apiSku || '');
    if (!key) return;
    const current = map.get(key);
    if (!current || Number(issue.revenue || 0) > Number(current.revenue || 0)) map.set(key, issue);
  });
  return map;
}

function applyDistribution(options) {
  if (!options.inputXlsx) {
    throw new Error(`WB owner distribution workbook not found. Expected ${DISTRIBUTION_FILE_NAME}`);
  }

  const distribution = readDistribution(options.inputXlsx);
  const skus = readSnapshot(options, 'skus', []);
  const quality = readSnapshot(options, 'portal_data_quality', { issues: [] });
  if (!Array.isArray(skus)) throw new Error('skus.json must be an array.');

  const qualityByArticle = qualityIssueIndex(quality);
  const lookup = buildSkuLookup(skus);
  const matchedByArticle = new Map();
  const missingInPortal = [];

  distribution.rows.forEach((row) => {
    const sku = lookup.exact.get(row.article) || lookup.loose.get(normalizeLoose(row.article));
    if (!sku) {
      const qualityIssue = qualityByArticle.get(row.article);
      missingInPortal.push({
        sourceRow: row.sourceRow,
        sourceArticle: row.sourceArticle,
        articleKey: row.article,
        ownerWb: row.owner,
        revenue: Math.round(Number(qualityIssue?.revenue || 0)),
        units: Math.round(Number(qualityIssue?.units || 0)),
        message: qualityIssue?.message || 'WB SKU from distribution is absent in portal skus.json'
      });
      return;
    }
    const articleKey = String(sku.articleKey || sku.article || row.article).trim();
    if (!articleKey) return;
    matchedByArticle.set(articleKey, row);
  });

  let updatedOwnerCount = 0;
  let unchangedOwnerCount = 0;
  let clearedMissingDistributionOwnerCount = 0;
  const matched = [];
  const missingInDistribution = [];
  const ownerCounts = {};

  const nextSkus = skus.map((sku) => {
    if (!isWbSku(sku)) return sku;
    const articleKey = String(sku.articleKey || sku.article || '').trim();
    const row = matchedByArticle.get(articleKey);
    const previousOwner = wbOwnerOf(sku);
    if (!row) {
      missingInDistribution.push({
        articleKey,
        article: sku.article || articleKey,
        name: sku.name || '',
        ownerWb: previousOwner,
        status: sku.status || sku.registryStatus || '',
        stock: Math.round(Number(sku.wb?.stock || 0))
      });
      if (options.clearMissingDistribution && previousOwner) {
        clearedMissingDistributionOwnerCount += 1;
        const ownersByPlatform = { ...(sku.ownersByPlatform || {}) };
        delete ownersByPlatform.wb;
        const ownerObject = typeof sku.owner === 'object' && sku.owner ? sku.owner : {};
        const ownerByPlatform = { ...(ownerObject.byPlatform || {}) };
        delete ownerByPlatform.wb;
        return {
          ...sku,
          ownersByPlatform,
          owner: {
            ...ownerObject,
            byPlatform: ownerByPlatform
          },
          wbOwnerDistribution: {
            owner: '',
            sourceFile: path.basename(options.inputXlsx),
            clearedAt: new Date().toISOString(),
            reason: 'missing_in_distribution'
          }
        };
      }
      return sku;
    }

    const owner = row.owner;
    ownerCounts[owner] = (ownerCounts[owner] || 0) + 1;
    const changed = previousOwner !== owner;
    if (changed) updatedOwnerCount += 1;
    else unchangedOwnerCount += 1;
    matched.push({
      articleKey,
      article: sku.article || articleKey,
      name: sku.name || '',
      previousOwnerWb: previousOwner,
      ownerWb: owner,
      changed,
      sourceRow: row.sourceRow
    });

    const next = {
      ...sku,
      ownersByPlatform: {
        ...(sku.ownersByPlatform || {}),
        wb: owner
      },
      owner: {
        ...(typeof sku.owner === 'object' && sku.owner ? sku.owner : {}),
        name: typeof sku.owner === 'object' && sku.owner?.name ? sku.owner.name : (sku.owner || owner),
        byPlatform: {
          ...(typeof sku.owner === 'object' && sku.owner?.byPlatform ? sku.owner.byPlatform : {}),
          wb: owner
        }
      },
      wbOwnerDistribution: {
        owner,
        sourceFile: path.basename(options.inputXlsx),
        sourceRow: row.sourceRow,
        appliedAt: new Date().toISOString()
      }
    };
    return next;
  });

  const audit = {
    schema: 'portal-wb-owner-distribution-audit-v1',
    generatedAt: new Date().toISOString(),
    source: {
      file: options.inputXlsx,
      sheetName: distribution.sheetName,
      sourceRowCount: distribution.sourceRowCount,
      mappedRowCount: distribution.rows.length,
      duplicateCount: distribution.duplicates.length,
      duplicateConflictCount: distribution.duplicates.filter((item) => item.conflict).length,
      articleColumnIndex: distribution.columns.articleIndex,
      ownerColumnIndex: distribution.columns.ownerIndex,
      headerRowIndex: distribution.columns.headerRowIndex
    },
    summary: {
      portalSkuCount: skus.length,
      wbSkuCount: skus.filter(isWbSku).length,
      matchedSkuCount: matched.length,
      updatedOwnerCount,
      unchangedOwnerCount,
      clearedMissingDistributionOwnerCount,
      missingInPortalCount: missingInPortal.length,
      missingInDistributionCount: missingInDistribution.length,
      ownerCounts
    },
    matched,
    missingInPortal,
    missingInDistribution,
    duplicates: distribution.duplicates
  };

  const skusOutput = writeSnapshot(options, 'skus', nextSkus);
  const auditOutput = writeSnapshot(options, 'wb_owner_distribution_audit', audit);
  return { audit, output: { skus: skusOutput, audit: auditOutput } };
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const result = applyDistribution(options);
  console.log(JSON.stringify({
    inputXlsx: options.inputXlsx,
    summary: result.audit.summary,
    output: result.output
  }, null, 2));
}

main();
