#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PUBLIC_RUN_SNAPSHOTS = [
  'dashboard',
  'portal_sync_health',
  'sku_aliases',
  'oos_control',
  'product_leaderboard',
  'repricer',
  'platform_trends'
];

const IU_DRR_SUMMARY_FILE = ['iu', 'drr', 'summary'].join('_') + '.json';

const PROTECTED_PUBLIC_FILES = new Set([
  'iu_plan.json',
  IU_DRR_SUMMARY_FILE
]);

const EXTRA_SANITIZE_FILES = [
  'ads_summary.json',
  'company_plan.json',
  'portal_runtime_wiring_reconciliation.json',
  'wb_owner_distribution_audit.json',
  'yandex_market_cluster_map.json'
];

const SANITIZE_ROOT_FILES = new Set([
  ...PUBLIC_RUN_SNAPSHOTS.map((name) => `${name}.json`),
  ...EXTRA_SANITIZE_FILES
]);

const PLATFORM_KEYS = ['wb', 'ozon'];
const HASH_SKIP_KEYS = new Set(['runId', 'generatedAt', 'checkedAt']);

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
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

function resolveOptions(args) {
  const root = process.cwd();
  const dataDir = path.resolve(args['data-dir'] || args['base-data-dir'] || path.join(root, 'data'));
  return {
    root,
    dataDir,
    lastGoodDir: path.resolve(args['last-good-dir'] || path.join(dataDir, 'last_good')),
    outputDir: path.resolve(args['output-dir'] || path.join(root, '.portal-truth-output'))
  };
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(text);
}

function writeJsonIfChanged(filePath, payload) {
  const next = `${JSON.stringify(payload, null, 2)}\n`;
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  if (current === next) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next, 'utf8');
  return true;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function averageRate(numerator, denominator) {
  const bottom = numberOrZero(denominator);
  return bottom ? numberOrZero(numerator) / bottom : 0;
}

function publicPathLabel(rawPath, root) {
  const normalized = String(rawPath || '').replace(/\//g, '\\');
  const rootWin = path.win32.resolve(root.replace(/\//g, '\\'));
  const absolute = path.win32.resolve(normalized);
  const relative = path.win32.relative(rootWin, absolute);
  if (relative && !relative.startsWith('..') && !path.win32.isAbsolute(relative)) {
    return relative.replace(/\\/g, '/');
  }
  return path.win32.basename(normalized) || 'local_path';
}

function sanitizeString(value, options) {
  if (!/[A-Z]:[\\/]/i.test(value)) return value;
  const trimmed = value.trim();
  if (/^[A-Z]:[\\/]/i.test(trimmed)) {
    return publicPathLabel(trimmed, options.root);
  }
  return value.replace(/[A-Z]:[\\/][^"'\r\n]+/gi, (match) => publicPathLabel(match, options.root));
}

function sanitizePayload(value, options) {
  if (typeof value === 'string') return sanitizeString(value, options);
  if (Array.isArray(value)) return value.map((item) => sanitizePayload(item, options));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, sanitizePayload(item, options)])
  );
}

function stableForHash(value) {
  if (Array.isArray(value)) return value.map(stableForHash);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !HASH_SKIP_KEYS.has(key))
      .sort()
      .map((key) => [key, stableForHash(value[key])])
  );
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function computeRunId(payloads) {
  const hashInput = Object.fromEntries(
    PUBLIC_RUN_SNAPSHOTS
      .filter((name) => isPlainObject(payloads[name]))
      .map((name) => [name, stableForHash(payloads[name])])
  );
  return `portal-${sha256(JSON.stringify(hashInput)).slice(0, 20)}`;
}

function normalizeDashboard(payload, report) {
  if (!isPlainObject(payload) || !Array.isArray(payload.cards)) return payload;
  const seen = new Set();
  payload.cards = payload.cards.map((card) => {
    if (!isPlainObject(card)) return card;
    const metricId = normalizeKey(card.metricId || card.id || card.key || card.label);
    if (!metricId || seen.has(metricId)) {
      report.dashboardDuplicateCards += 1;
    } else {
      seen.add(metricId);
    }
    return { ...card, id: card.id || metricId, metricId };
  });
  return payload;
}

function normalizeAliases(payload, lastGoodPayload, report) {
  if (!isPlainObject(payload)) return payload;
  const current = Array.isArray(payload.aliases) ? payload.aliases : [];
  const previous = Array.isArray(lastGoodPayload?.aliases) ? lastGoodPayload.aliases : [];
  if (current.length === 0 && previous.length > 0 && !payload.authoritativeEmpty) {
    payload.aliases = previous;
    payload.restoredFromLastGood = true;
    payload.authoritativeEmpty = false;
    payload.status = 'warning';
    payload.quarantine = {
      reason: 'alias_source_empty_regression',
      currentAliasCount: 0,
      restoredAliasCount: previous.length
    };
    report.aliasesRestored = previous.length;
  }
  return payload;
}

function recountOosGroup(items, rows, keyName) {
  if (!Array.isArray(items)) return items;
  const grouped = new Map();
  rows.forEach((row) => {
    const key = row?.[keyName] || '';
    if (!key) return;
    if (!grouped.has(key)) grouped.set(key, { oos: 0, critical: 0, risk: 0, watch: 0 });
    const item = grouped.get(key);
    if (row.status === 'oos') item.oos += 1;
    if (row.severity === 'critical') item.critical += 1;
    if (row.status === 'risk') item.risk += 1;
    if (row.status === 'watch') item.watch += 1;
  });
  return items.map((item) => {
    const counts = grouped.get(item.key) || grouped.get(item.label);
    return counts ? { ...item, ...counts } : item;
  });
}

function normalizeOos(payload, report) {
  if (!isPlainObject(payload) || !Array.isArray(payload.rows)) return payload;
  const rows = payload.rows;
  const oosCount = rows.filter((row) => row?.status === 'oos').length;
  const criticalCount = rows.filter((row) => row?.severity === 'critical').length;
  const riskCount = rows.filter((row) => row?.status === 'risk').length;
  const watchCount = rows.filter((row) => row?.status === 'watch').length;
  const patchCounts = (target) => {
    if (!isPlainObject(target)) return;
    target.oosCount = oosCount;
    target.criticalCount = criticalCount;
    target.riskCount = riskCount;
    target.watchCount = watchCount;
  };
  const before = numberOrZero(payload.summary?.criticalCount);
  patchCounts(payload.summary);
  patchCounts(payload.history?.latest);
  const latestDate = payload.summary?.date || payload.history?.latest?.date || '';
  if (Array.isArray(payload.history?.days)) {
    payload.history.days = payload.history.days.map((item) => (
      item?.date === latestDate ? { ...item, oosCount, criticalCount, riskCount, watchCount } : item
    ));
  }
  payload.byPlatform = recountOosGroup(payload.byPlatform, rows, 'platform');
  payload.byOwner = recountOosGroup(payload.byOwner, rows, 'owner');
  payload.byDepartment = recountOosGroup(payload.byDepartment, rows, 'department');
  if (before !== criticalCount) report.oosCriticalCountFixed = { before, after: criticalCount };
  return payload;
}

function itemKey(item) {
  return normalizeKey(item?.articleKey || item?.article || item?.id || item?.name);
}

function dedupeItems(items) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = itemKey(item);
    if (key && !map.has(key)) map.set(key, item);
  });
  return [...map.values()];
}

function withLeaderboardProvenance(item) {
  if (!isPlainObject(item)) return item;
  const provenance = isPlainObject(item.provenance) ? { ...item.provenance } : {};
  const revenueProvenance = item.revenueProvenance || provenance.revenue || 'source_or_derived_product_leaderboard';
  const incomeProvenance = item.incomeProvenance || provenance.income || 'source_or_derived_product_leaderboard';
  return {
    ...item,
    revenueProvenance,
    incomeProvenance,
    provenance: {
      ...provenance,
      revenue: revenueProvenance,
      income: incomeProvenance
    }
  };
}

function buildLeaderboardSummary(items) {
  const reach = items.reduce((sum, item) => sum + numberOrZero(item.reach), 0);
  const reactions = items.reduce((sum, item) => sum + numberOrZero(item.reactions), 0);
  const posts = items.reduce((sum, item) => sum + numberOrZero(item.posts), 0);
  const clicks = items.reduce((sum, item) => sum + numberOrZero(item.clicks), 0);
  const carts = items.reduce((sum, item) => sum + numberOrZero(item.carts), 0);
  const orders = items.reduce((sum, item) => sum + numberOrZero(item.orders), 0);
  const buys = items.reduce((sum, item) => sum + numberOrZero(item.buys), 0);
  const contentCost = items.reduce((sum, item) => sum + numberOrZero(item.contentCost), 0);
  const revenue = items.reduce((sum, item) => sum + numberOrZero(item.revenue), 0);
  const income = items.reduce((sum, item) => sum + numberOrZero(item.income), 0);
  return {
    skuCount: items.length,
    ownerCount: new Set(items.map((item) => normalizeKey(item.owner)).filter(Boolean)).size,
    reach,
    reactions,
    posts,
    clicks,
    carts,
    orders,
    buys,
    contentCost,
    revenue,
    income,
    ctrPct: averageRate(clicks, reach),
    cartRatePct: averageRate(carts, clicks),
    orderRatePct: averageRate(orders, clicks),
    buyRatePct: averageRate(buys, clicks),
    buyoutPct: averageRate(buys, orders),
    romiPct: averageRate(income, contentCost),
    drrPct: averageRate(contentCost, revenue)
  };
}

function normalizeLeaderboard(payload, report) {
  if (!isPlainObject(payload)) return payload;
  const sourceItems = Array.isArray(payload.items) ? payload.items.map(withLeaderboardProvenance) : [];
  const sourceUnmatched = Array.isArray(payload.unmatchedItems) ? payload.unmatchedItems.map(withLeaderboardProvenance) : [];
  const matched = dedupeItems(sourceItems.filter((item) => item?.inPortal !== false));
  const unmatched = dedupeItems([
    ...sourceUnmatched,
    ...sourceItems.filter((item) => item?.inPortal === false)
  ]);
  payload.items = matched;
  payload.unmatchedItems = unmatched;
  payload.totals = {
    ...(payload.totals || {}),
    brandRows: matched.length + unmatched.length,
    matchedRows: matched.length,
    unmatchedRows: unmatched.length
  };
  payload.summary = {
    ...(payload.summary || {}),
    ...buildLeaderboardSummary(matched)
  };
  report.leaderboard = {
    items: matched.length,
    unmatchedItems: unmatched.length
  };
  return payload;
}

function blockUnknownSide(side, rowCostKnown, report) {
  if (!isPlainObject(side)) return side;
  const stockKnown = side.stockState !== 'unknown' && side.procurementSnapshotAvailable !== false;
  const costKnown = rowCostKnown && side.costState !== 'unknown';
  side.stockState = stockKnown ? (side.stockState || 'known') : 'unknown';
  side.costState = costKnown ? 'known' : 'unknown';
  if (stockKnown && costKnown) return side;
  const currentPrice = numberOrZero(side.currentPrice);
  if (Math.abs(numberOrZero(side.recPrice) - currentPrice) >= 1) report.repricerBlockedSides += 1;
  side.recPrice = currentPrice;
  side.changePct = 0;
  side.newBuyerPrice = numberOrZero(side.buyerPrice) || currentPrice;
  side.action = 'BLOCK_DATA';
  side.strategy = 'BLOCK_DATA';
  side.blockReason = !stockKnown && !costKnown
    ? 'unknown_stock_and_cost'
    : (!stockKnown ? 'unknown_stock_snapshot' : 'unknown_cost');
  side.reason = !stockKnown && !costKnown
    ? 'Missing stock snapshot and cost: price recommendation is blocked at current price.'
    : (!stockKnown
      ? 'Missing stock snapshot: price recommendation is blocked at current price.'
      : 'Missing cost: price recommendation is blocked at current price.');
  return side;
}

function buildRepricerSummary(rows) {
  const summary = {
    skuCount: rows.length,
    wbChangeCount: 0,
    ozonChangeCount: 0,
    wbBelowMinCount: 0,
    ozonBelowMinCount: 0,
    wbMarginRiskCount: 0,
    ozonMarginRiskCount: 0,
    wbEqualizeCount: 0,
    ozonEqualizeCount: 0,
    wbTurnoverCount: 0,
    ozonTurnoverCount: 0
  };
  rows.forEach((row) => {
    PLATFORM_KEYS.forEach((platform) => {
      const side = row?.[platform];
      if (!side) return;
      const prefix = platform === 'wb' ? 'wb' : 'ozon';
      if (Math.abs(numberOrZero(side.recPrice) - numberOrZero(side.currentPrice)) >= 1) summary[`${prefix}ChangeCount`] += 1;
      if (numberOrZero(side.currentPrice) > 0 && numberOrZero(side.minPrice) > 0 && numberOrZero(side.currentPrice) + 0.001 < numberOrZero(side.minPrice)) {
        summary[`${prefix}BelowMinCount`] += 1;
      }
      const currentMargin = side.marginNoAdsCurrentPct ?? side.marginPct;
      const thresholdMargin = side.marginNoAdsMinPct ?? side.allowedMarginPct;
      if (currentMargin !== null && thresholdMargin !== null && Number(currentMargin) + 1e-9 < Number(thresholdMargin)) {
        summary[`${prefix}MarginRiskCount`] += 1;
      }
      if (numberOrZero(side.turnoverDays) > 0) summary[`${prefix}TurnoverCount`] += 1;
      const strategy = String(side.strategy || '').toUpperCase();
      const reason = String(side.reason || '').toLowerCase();
      if (strategy.includes('ALIGN') || reason.includes('equalize') || reason.includes('align') || reason.includes('вырав')) {
        summary[`${prefix}EqualizeCount`] += 1;
      }
    });
  });
  return summary;
}

function normalizeRepricer(payload, report) {
  if (!isPlainObject(payload) || !Array.isArray(payload.rows)) return payload;
  payload.rows.forEach((row) => {
    const rowCostKnown = row?.cost !== null && row?.cost !== undefined && row?.cost !== '';
    PLATFORM_KEYS.forEach((platform) => {
      if (row?.[platform]) row[platform] = blockUnknownSide(row[platform], rowCostKnown, report);
    });
  });
  payload.summary = buildRepricerSummary(payload.rows);
  return payload;
}

function loadRootDataPayloads(options) {
  const payloads = {};
  [...SANITIZE_ROOT_FILES]
    .filter((name) => fs.existsSync(path.join(options.dataDir, name)))
    .forEach((name) => {
      const filePath = path.join(options.dataDir, name);
      payloads[name] = readJsonIfExists(filePath);
    });
  return payloads;
}

function finalizeAtomicSnapshots(options) {
  options.root = options.root || process.cwd();
  const report = {
    schema: 'portal-atomic-snapshot-finalization-v1',
    dashboardDuplicateCards: 0,
    aliasesRestored: 0,
    oosCriticalCountFixed: null,
    repricerBlockedSides: 0,
    leaderboard: null,
    sanitizedFiles: [],
    runId: ''
  };

  const rootPayloads = loadRootDataPayloads(options);
  Object.entries(rootPayloads).forEach(([fileName, payload]) => {
    if (PROTECTED_PUBLIC_FILES.has(fileName)) return;
    rootPayloads[fileName] = sanitizePayload(payload, options);
  });

  const payloads = Object.fromEntries(
    PUBLIC_RUN_SNAPSHOTS.map((name) => [name, rootPayloads[`${name}.json`]])
  );
  payloads.dashboard = normalizeDashboard(payloads.dashboard, report);
  payloads.sku_aliases = normalizeAliases(
    payloads.sku_aliases,
    readJsonIfExists(path.join(options.lastGoodDir, 'sku_aliases.json')),
    report
  );
  payloads.oos_control = normalizeOos(payloads.oos_control, report);
  payloads.product_leaderboard = normalizeLeaderboard(payloads.product_leaderboard, report);
  payloads.repricer = normalizeRepricer(payloads.repricer, report);

  const runId = computeRunId(payloads);
  report.runId = runId;
  PUBLIC_RUN_SNAPSHOTS.forEach((name) => {
    const payload = payloads[name];
    if (isPlainObject(payload)) payload.runId = runId;
    rootPayloads[`${name}.json`] = payload;
  });

  Object.entries(rootPayloads).forEach(([fileName, payload]) => {
    if (PROTECTED_PUBLIC_FILES.has(fileName) || payload === null) return;
    const changed = writeJsonIfChanged(path.join(options.dataDir, fileName), payload);
    if (changed) report.sanitizedFiles.push(fileName);
  });

  fs.mkdirSync(options.outputDir, { recursive: true });
  writeJsonIfChanged(path.join(options.outputDir, 'portal_atomic_snapshot_finalization.json'), report);
  return report;
}

function main() {
  const report = finalizeAtomicSnapshots(resolveOptions(parseArgs(process.argv)));
  console.log(JSON.stringify({
    runId: report.runId,
    sanitizedFiles: report.sanitizedFiles.length,
    aliasesRestored: report.aliasesRestored,
    repricerBlockedSides: report.repricerBlockedSides,
    oosCriticalCountFixed: report.oosCriticalCountFixed,
    leaderboard: report.leaderboard
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  finalizeAtomicSnapshots,
  resolveOptions
};
