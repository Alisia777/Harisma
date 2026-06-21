#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

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
  return {
    inputDir: path.resolve(args['input-dir'] || path.join(root, '.altea-google-sheet-sync-output')),
    baseDataDir: path.resolve(args['base-data-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || args['input-dir'] || path.join(root, '.altea-google-sheet-sync-output')),
    mirrorLocalFallback: Boolean(args['mirror-local-fallback'])
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

function normalizeToken(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^a-zа-я0-9]+/gi, '');
}

function platformKey(value = '') {
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

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function platformOwnerText(sku = {}, platform = '') {
  const platformToken = platformKey(platform);
  const byPlatform = {
    ...(sku.owner?.byPlatform && typeof sku.owner.byPlatform === 'object' ? sku.owner.byPlatform : {}),
    ...(sku.ownersByPlatform && typeof sku.ownersByPlatform === 'object' ? sku.ownersByPlatform : {})
  };
  const platformAliases = platformToken === 'ya'
    ? ['ym', 'ya', 'yandex']
    : platformToken === 'goldapple'
      ? ['ga', 'goldapple']
      : platformToken === 'magnit'
        ? ['mm', 'magnit']
        : [platformToken];
  if (platformToken && platformToken !== 'all') {
    for (const key of platformAliases) {
      const platformOwner = String(byPlatform[key] || '').trim();
      if (platformOwner) return platformOwner;
    }
  }
  return '';
}

function ownerText(sku = {}, platform = '') {
  const platformOwner = platformOwnerText(sku, platform);
  if (platformOwner) return platformOwner;
  if (typeof sku.owner === 'string') return sku.owner.trim();
  const directOwner = String(sku.owner?.name || '').trim();
  if (directOwner) return directOwner;
  const byPlatform = {
    ...(sku.owner?.byPlatform && typeof sku.owner.byPlatform === 'object' ? sku.owner.byPlatform : {}),
    ...(sku.ownersByPlatform && typeof sku.ownersByPlatform === 'object' ? sku.ownersByPlatform : {})
  };
  const platformOrder = ['wb', 'ozon', 'ym', 'ya', 'ga', 'goldapple', 'letu', 'mm', 'magnit'];
  for (const platform of platformOrder) {
    const platformOwner = String(byPlatform[platform] || '').trim();
    if (platformOwner) return platformOwner;
  }
  return Object.values(byPlatform).map((value) => String(value || '').trim()).find(Boolean) || '';
}

function productOwnerText(sku = {}) {
  if (typeof sku.owner === 'string') return sku.owner.trim();
  return String(sku.owner?.name || '').trim();
}

function platformOwnerMap(sku = {}) {
  const platforms = ['wb', 'ozon', 'ym', 'ga', 'letu', 'mm'];
  return Object.fromEntries(platforms.map((platform) => [platform, platformOwnerText(sku, platform)]).filter(([, owner]) => owner));
}

function ownerDisplayText(productOwner = '', ownersByPlatform = {}) {
  const entries = Object.entries(ownersByPlatform).filter(([, owner]) => owner);
  if (!entries.length) return productOwner;
  const uniqueOwners = [...new Set(entries.map(([, owner]) => owner))];
  if (uniqueOwners.length === 1 && (!productOwner || productOwner === uniqueOwners[0])) return uniqueOwners[0];
  return entries.map(([platform, owner]) => `${platform}: ${owner}`).join('; ');
}

function ownerConflictsForSku(sku = {}, ownersByPlatform = {}) {
  const conflicts = [];
  const wbDistributionOwner = String(sku.wbOwnerDistribution?.owner || '').trim();
  const wbOwner = String(ownersByPlatform.wb || '').trim();
  if (wbDistributionOwner && wbOwner && !sameOwnerIdentity(wbDistributionOwner, wbOwner)) {
    conflicts.push({
      platform: 'wb',
      canonicalOwner: wbOwner,
      conflictingOwner: wbDistributionOwner,
      source: sku.wbOwnerDistribution?.sourceFile || 'wbOwnerDistribution',
      sourceRow: sku.wbOwnerDistribution?.sourceRow || null
    });
  }
  return conflicts;
}

function sameOwnerIdentity(left = '', right = '') {
  const leftToken = normalizeToken(left);
  const rightToken = normalizeToken(right);
  if (!leftToken || !rightToken) return false;
  if (leftToken === rightToken) return true;
  if (leftToken.length >= 4 && rightToken.includes(leftToken)) return true;
  if (rightToken.length >= 4 && leftToken.includes(rightToken)) return true;
  return false;
}

function skuTokens(sku = {}) {
  const values = [
    sku.articleKey,
    sku.article,
    sku.sku,
    sku.vendorCode,
    sku.supplierArticle,
    sku.nmId,
    sku.nmID,
    sku.barcode
  ];
  if (Array.isArray(sku.aliases)) {
    sku.aliases.forEach((alias) => {
      if (typeof alias === 'string') values.push(alias);
      else values.push(alias?.value, alias?.alias, alias?.sku, alias?.article, alias?.articleKey, alias?.offerId, alias?.vendorCode, alias?.nmId);
    });
  }
  Object.values(sku.platformAliases || {}).forEach((aliases) => {
    if (Array.isArray(aliases)) values.push(...aliases);
    else values.push(aliases);
  });
  return values.map(normalizeToken).filter(Boolean);
}

function buildSkuLookup(skus = []) {
  const lookup = new Map();
  const conflicts = [];
  skus.forEach((sku) => {
    skuTokens(sku).forEach((token) => {
      if (!token) return;
      const existing = lookup.get(token);
      if (!existing) {
        lookup.set(token, sku);
        return;
      }
      const existingArticle = existing.articleKey || existing.article || '';
      const article = sku.articleKey || sku.article || '';
      if (normalizeToken(existingArticle) !== normalizeToken(article)) {
        conflicts.push({ token, articles: [existingArticle, article].filter(Boolean) });
      }
    });
  });
  lookup.conflicts = conflicts;
  return lookup;
}

function embeddedAliasRows(skus = []) {
  const rows = [];
  const add = (sku, platform, value, source, note = '') => {
    const target = sku?.articleKey || sku?.article || sku?.sku || '';
    const apiSku = typeof value === 'string'
      ? value
      : (value?.value || value?.alias || value?.api_sku || value?.apiSku || value?.sku || value?.article || value?.articleKey || value?.offerId || value?.vendorCode || value?.nmId || '');
    if (!target || !apiSku) return;
    rows.push({
      target_sku: target,
      platform: platform || value?.platform || 'all',
      api_sku: apiSku,
      status: value?.status || 'active',
      note: note || value?.note || '',
      source
    });
  };
  (Array.isArray(skus) ? skus : []).forEach((sku) => {
    if (Array.isArray(sku.aliases)) {
      sku.aliases.forEach((alias) => add(sku, alias?.platform || 'all', alias, alias?.source || 'skus.aliases', alias?.note || ''));
    }
    Object.entries(sku.platformAliases || {}).forEach(([platform, aliases]) => {
      if (Array.isArray(aliases)) aliases.forEach((alias) => add(sku, platform, alias, 'skus.platformAliases'));
      else add(sku, platform, aliases, 'skus.platformAliases');
    });
  });
  return rows;
}

function aliasRows(payload = {}) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.aliases) ? payload.aliases : [];
}

function ignoreRows(payload = {}) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.ignored)) return payload.ignored;
  if (Array.isArray(payload.ignores)) return payload.ignores;
  if (Array.isArray(payload.rows)) return payload.rows;
  return [];
}

function activeIgnoreRows(payload = {}) {
  return ignoreRows(payload).filter((row) => {
    const status = normalizeToken(row?.status ?? row?.active ?? 'active');
    return !['0', 'false', 'no', 'off', 'disabled', 'inactive', 'deleted', 'remove'].includes(status);
  });
}

function aliasKey(platform = '', apiSku = '') {
  return `${platformKey(platform) || 'all'}|${normalizeToken(apiSku)}`;
}

function issuesByArticle(quality = {}) {
  const map = new Map();
  (quality.issues || []).forEach((issue) => {
    const token = normalizeToken(issue.articleKey || issue.article || '');
    if (!token) return;
    if (!map.has(token)) map.set(token, []);
    map.get(token).push({
      severity: issue.severity || '',
      type: issue.type || '',
      platform: issue.platform || '',
      revenue: Math.round(numberOrZero(issue.revenue)),
      units: Math.round(numberOrZero(issue.units)),
      message: issue.message || issue.action || ''
    });
  });
  return map;
}

const PROBLEM_STATE_META = {
  ok: { label: '\u0412 \u043c\u0430\u0442\u0440\u0438\u0446\u0435', tone: 'ok' },
  missing_owner: { label: '\u041d\u0435\u0442 owner', tone: 'warn' },
  has_critical_issue: { label: '\u0415\u0441\u0442\u044c \u043a\u0440\u0438\u0442\u0438\u0447\u043d\u0430\u044f \u043e\u0448\u0438\u0431\u043a\u0430', tone: 'danger' },
  has_warning: { label: '\u0415\u0441\u0442\u044c \u0437\u0430\u043c\u0435\u0447\u0430\u043d\u0438\u0435', tone: 'warn' },
  owner_platform_conflict: { label: 'Owner conflict', tone: 'warn' },
  alias_collision: { label: 'Alias collision', tone: 'danger' },
  api_unmapped: { label: 'API SKU \u0431\u0435\u0437 \u043f\u0430\u0440\u044b', tone: 'danger' },
  ignored: { label: 'API SKU \u0432 ignore', tone: '' },
  duplicate_risk: { label: '\u0420\u0438\u0441\u043a \u0434\u0443\u0431\u043b\u044f \u0432\u044b\u0440\u0443\u0447\u043a\u0438', tone: 'danger' }
};

function isMissingOwnerText(owner = '') {
  const raw = String(owner || '').trim().toLowerCase();
  return !raw
    || raw === 'без owner'
    || raw === 'р‘рµр· owner'
    || raw === 'не в реестре'
    || raw === 'рќрµ рІ сЂрµрµсЃс‚сЂрµ';
}

function isActionIssue(issue = {}) {
  const severity = String(issue.severity || '').trim().toLowerCase();
  return ['critical', 'danger', 'warning', 'warn'].includes(severity);
}

function problemStatesForItem(owner = '', issues = [], diagnostics = {}) {
  const states = [];
  if (isMissingOwnerText(owner)) states.push('missing_owner');
  if ((diagnostics.ownerConflicts || []).length) states.push('owner_platform_conflict');
  if ((diagnostics.aliasConflicts || []).length || (diagnostics.tokenConflicts || []).length) states.push('alias_collision');
  if (issues.some((issue) => issue.severity === 'critical' || issue.severity === 'danger')) {
    states.push('has_critical_issue');
  } else if (issues.some(isActionIssue)) {
    states.push('has_warning');
  }
  return states.length ? states : ['ok'];
}

function summarizeProblemStates(items = [], apiUnmapped = [], ignored = [], duplicateRisks = []) {
  const counts = {};
  const bump = (state) => { counts[state] = (counts[state] || 0) + 1; };
  items.forEach((item) => (item.problemStates || ['ok']).forEach(bump));
  if (apiUnmapped.length) bump('api_unmapped');
  if (ignored.length) bump('ignored');
  if (duplicateRisks.length) bump('duplicate_risk');
  return counts;
}

function buildMatrix(options) {
  const skus = readSnapshot(options, 'skus', []);
  const externalAliases = aliasRows(readSnapshot(options, 'sku_aliases', { aliases: [] }));
  const ignored = activeIgnoreRows(readSnapshot(options, 'sku_alias_ignore', { ignored: [] }));
  const quality = readSnapshot(options, 'portal_data_quality', { issues: [], summary: {} });
  const skuList = Array.isArray(skus) ? skus : [];
  const embeddedAliases = embeddedAliasRows(skuList);
  const aliases = [...externalAliases, ...embeddedAliases];
  const skuLookup = buildSkuLookup(skuList);
  const qualityByArticle = issuesByArticle(quality);
  const aliasesByTarget = new Map();
  const aliasToArticleKey = {};
  const aliasToArticleKeys = {};
  const aliasTargets = new Map();
  const seenAliases = new Set();

  aliases.forEach((alias) => {
    const targetToken = normalizeToken(alias.target_sku || alias.targetSku || alias.target || '');
    const apiToken = normalizeToken(alias.api_sku || alias.apiSku || alias.alias || alias.value || '');
    if (!targetToken || !apiToken) return;
    const target = skuLookup.get(targetToken);
    const articleKey = target?.articleKey || target?.article || alias.target_sku || '';
    if (!articleKey) return;
    if (!aliasesByTarget.has(articleKey)) aliasesByTarget.set(articleKey, []);
    const platform = platformKey(alias.platform || 'all') || 'all';
    const row = {
      platform,
      api_sku: alias.api_sku || alias.apiSku || alias.alias || alias.value || '',
      status: alias.status || 'active',
      note: alias.note || '',
      source: alias.source || 'sku_aliases'
    };
    const mapKey = aliasKey(platform, row.api_sku);
    const dedupeKey = `${mapKey}|${articleKey}`;
    if (seenAliases.has(dedupeKey)) return;
    seenAliases.add(dedupeKey);
    aliasesByTarget.get(articleKey).push(row);
    if (!aliasTargets.has(mapKey)) aliasTargets.set(mapKey, new Set());
    aliasTargets.get(mapKey).add(articleKey);
    if (!aliasToArticleKey[mapKey]) aliasToArticleKey[mapKey] = articleKey;
  });

  const aliasConflicts = [...aliasTargets.entries()]
    .filter(([, targets]) => targets.size > 1)
    .map(([key, targets]) => {
      const [platform, api_sku] = key.split('|');
      const articles = [...targets].sort();
      aliasToArticleKeys[key] = articles;
      return { platform, api_sku, articles };
    });
  aliasTargets.forEach((targets, key) => {
    if (!aliasToArticleKeys[key]) aliasToArticleKeys[key] = [...targets].sort();
  });
  const aliasConflictsByArticle = new Map();
  aliasConflicts.forEach((conflict) => {
    conflict.articles.forEach((articleKey) => {
      if (!aliasConflictsByArticle.has(articleKey)) aliasConflictsByArticle.set(articleKey, []);
      aliasConflictsByArticle.get(articleKey).push(conflict);
    });
  });
  const tokenConflictsByArticle = new Map();
  (skuLookup.conflicts || []).forEach((conflict) => {
    (conflict.articles || []).forEach((articleKey) => {
      if (!tokenConflictsByArticle.has(articleKey)) tokenConflictsByArticle.set(articleKey, []);
      tokenConflictsByArticle.get(articleKey).push(conflict);
    });
  });

  const items = skuList.map((sku) => {
    const articleKey = sku.articleKey || sku.article || '';
    const issues = qualityByArticle.get(normalizeToken(articleKey)) || [];
    const productOwner = productOwnerText(sku);
    const platformOwners = platformOwnerMap(sku);
    const ownerConflicts = ownerConflictsForSku(sku, platformOwners);
    const owner = ownerDisplayText(productOwner, platformOwners);
    const aliasConflictsForItem = aliasConflictsByArticle.get(articleKey) || [];
    const tokenConflictsForItem = tokenConflictsByArticle.get(articleKey) || [];
    const problemStates = problemStatesForItem(owner, issues, {
      ownerConflicts,
      aliasConflicts: aliasConflictsForItem,
      tokenConflicts: tokenConflictsForItem
    });
    return {
      articleKey,
      article: sku.article || articleKey,
      name: sku.name || '',
      owner,
      productOwner,
      platformOwners,
      ownerSources: {
        product: sku.owner?.source || '',
        byPlatform: sku.owner?.byPlatform || sku.ownersByPlatform ? 'skus.owner.byPlatform / skus.ownersByPlatform' : '',
        wbOwnerDistribution: sku.wbOwnerDistribution?.sourceFile || ''
      },
      ownerConflicts,
      status: sku.status || sku.registryStatus || '',
      registryStatus: sku.registryStatus || sku.status || '',
      brand: sku.brand || '',
      category: sku.category || '',
      type: sku.type || '',
      aliases: aliasesByTarget.get(articleKey) || [],
      aliasConflicts: aliasConflictsForItem,
      tokenConflicts: tokenConflictsForItem,
      problemStates,
      problemState: problemStates[0] || 'ok',
      problemLabel: PROBLEM_STATE_META[problemStates[0]]?.label || '',
      problemTone: PROBLEM_STATE_META[problemStates[0]]?.tone || '',
      issueCount: issues.filter(isActionIssue).length,
      infoIssueCount: Math.max(0, issues.length - issues.filter(isActionIssue).length),
      criticalIssueCount: issues.filter((issue) => issue.severity === 'critical' || issue.severity === 'danger').length,
      issues: issues.slice(0, 20)
    };
  });

  const byArticleKey = {};
  items.forEach((item, index) => { if (item.articleKey) byArticleKey[item.articleKey] = index; });

  const qualityIssues = Array.isArray(quality.issues) ? quality.issues : [];
  const actionIssues = qualityIssues.filter(isActionIssue);
  const apiUnmapped = qualityIssues
    .filter((issue) => issue.type === 'api_sku_unmapped' && isActionIssue(issue))
    .map((issue) => ({
      platform: platformKey(issue.platform || '') || issue.platform || '',
      api_sku: issue.articleKey || '',
      name: issue.name || '',
      revenue: Math.round(numberOrZero(issue.revenue)),
      units: Math.round(numberOrZero(issue.units)),
      firstDate: issue.firstDate || '',
      lastDate: issue.lastDate || ''
    }));

  const duplicateRisks = (quality.issues || [])
    .filter((issue) => issue.type === 'api_sum_above_aggregate')
    .map((issue) => ({
      platform: platformKey(issue.platform || '') || issue.platform || '',
      platformLabel: issue.platformLabel || issue.platform || '',
      revenue: Math.round(numberOrZero(issue.revenue)),
      aggregateRevenue: Math.round(numberOrZero(issue.aggregateRevenue)),
      overage: Math.round(numberOrZero(issue.overage)),
      message: issue.message || ''
    }));

  return {
    schema: 'portal-sku-matrix-v2',
    generatedAt: new Date().toISOString(),
    source: {
      skus: skuList.length,
      aliases: seenAliases.size,
      externalAliases: externalAliases.length,
      embeddedAliases: embeddedAliases.length,
      ignored: ignored.length,
      dataQualityGeneratedAt: quality.generatedAt || ''
    },
    summary: {
      skuCount: items.length,
      activeSkuCount: items.filter((item) => !/вывод|inactive|disabled/i.test(item.status || item.registryStatus || '')).length,
      aliasCount: seenAliases.size,
      aliasConflictCount: aliasConflicts.length,
      skuTokenConflictCount: (skuLookup.conflicts || []).length,
      ownerConflictCount: items.reduce((sum, item) => sum + (item.ownerConflicts || []).length, 0),
      ignoredApiSkuCount: ignored.length,
      apiUnmappedCount: apiUnmapped.length,
      duplicateRiskCount: duplicateRisks.length,
      duplicateRiskOverage: duplicateRisks.reduce((sum, item) => sum + numberOrZero(item.overage), 0),
      missingOwnerCount: items.filter((item) => isMissingOwnerText(item.owner)).length,
      issueCount: actionIssues.length,
      infoIssueCount: Math.max(0, qualityIssues.length - actionIssues.length),
      problemStateCounts: summarizeProblemStates(items, apiUnmapped, ignored, duplicateRisks)
    },
    problemStates: PROBLEM_STATE_META,
    items,
    aliasConflicts,
    skuTokenConflicts: skuLookup.conflicts || [],
    apiUnmapped,
    duplicateRisks,
    ignoredApiSku: ignored.map((row) => ({
      platform: platformKey(row.platform || 'all') || 'all',
      api_sku: row.api_sku || row.apiSku || row.alias || row.value || '',
      status: row.status || 'ignored',
      note: row.note || ''
    })),
    indexes: {
      byArticleKey,
      aliasToArticleKey,
      aliasToArticleKeys
    }
  };
}

function writeMatrix(options, matrix) {
  fs.mkdirSync(options.outputDir, { recursive: true });
  const outputPath = path.join(options.outputDir, 'sku_matrix.json');
  fs.writeFileSync(outputPath, JSON.stringify(matrix, null, 2), 'utf8');
  const mirrored = [];
  if (options.mirrorLocalFallback) {
    fs.mkdirSync(options.baseDataDir, { recursive: true });
    const mirrorPath = path.join(options.baseDataDir, 'sku_matrix.json');
    fs.copyFileSync(outputPath, mirrorPath);
    mirrored.push(mirrorPath);
  }
  return { outputPath, mirrored };
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const matrix = buildMatrix(options);
  const output = writeMatrix(options, matrix);
  console.log(JSON.stringify({ summary: matrix.summary, output }, null, 2));
}

main();
