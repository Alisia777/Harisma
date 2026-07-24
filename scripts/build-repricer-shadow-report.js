#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { buildCanonicalRepricer, resolveOptions: resolveCanonicalOptions } = require('./build-canonical-repricer');
const { normalizeKey } = require('./smart-price-contour');

const OUTPUT_FILE = 'repricer_shadow_report.json';

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) continue;
    const equal = token.indexOf('=');
    const key = token.slice(2, equal >= 0 ? equal : undefined);
    if (equal >= 0) {
      args[key] = token.slice(equal + 1);
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

function boundedRatio(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function positiveNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function resolveOptions(args = {}) {
  const root = process.cwd();
  const inputDir = path.resolve(args['input-dir'] || path.join(root, 'data'));
  const outputDir = path.resolve(args['output-dir'] || inputDir);
  return {
    inputDir,
    outputDir,
    canonicalPath: path.resolve(args.canonical || path.join(outputDir, 'canonical_repricer.json')),
    legacyPath: path.resolve(args.legacy || path.join(inputDir, 'repricer.json')),
    gapsPath: path.resolve(args.gaps || path.join(inputDir, 'repricer_margin_minmax_gaps.json')),
    reportPath: path.resolve(args.output || path.join(outputDir, OUTPUT_FILE)),
    priceToleranceRub: Math.max(0, Number(args['price-tolerance-rub']) || 1),
    minCanonicalCoverage: boundedRatio(args['min-canonical-coverage'], 0.95),
    minPriceAgreement: boundedRatio(args['min-price-agreement'], 0.95),
    noWrite: Boolean(args['no-write'])
  };
}

function legacySideMap(legacy = {}) {
  const map = new Map();
  const rows = Array.isArray(legacy?.rows) ? legacy.rows : [];
  rows.forEach((row) => {
    const articleKey = normalizeKey(row?.articleKey || row?.article || row?.sku || row?.offerId);
    if (!articleKey) return;
    ['wb', 'ozon'].forEach((platform) => {
      const side = row?.[platform];
      if (!side || typeof side !== 'object') return;
      const key = `${articleKey}::${platform}`;
      if (map.has(key)) return;
      map.set(key, {
        articleKey,
        platform,
        price: positiveNumber(side.recPrice, side.newBuyerPrice, side.currentPrice, side.buyerPrice),
        currentPrice: positiveNumber(side.currentPrice, side.buyerPrice),
        action: String(side.action || side.strategy || '').trim(),
        reason: String(side.reason || side.blockReason || '').trim()
      });
    });
  });
  return map;
}

function compareRepricerSnapshots({
  canonical = {},
  legacy = {},
  gaps = null,
  priceToleranceRub = 1,
  minCanonicalCoverage = 0.95,
  minPriceAgreement = 0.95,
  generatedAt = new Date().toISOString()
} = {}) {
  const canonicalRows = Array.isArray(canonical?.rows) ? canonical.rows : [];
  const legacyMap = legacySideMap(legacy);
  const readyRows = canonicalRows.filter((row) => (
    row?.recommendation?.status === 'ready'
    && positiveNumber(row?.recommendation?.price) !== null
  ));
  const comparisons = readyRows.map((row) => {
    const articleKey = normalizeKey(row?.article_key || row?.articleKey || row?.article);
    const platform = String(row?.platform || '').trim().toLowerCase();
    const key = `${articleKey}::${platform}`;
    const legacySide = legacyMap.get(key) || null;
    const canonicalPrice = positiveNumber(row?.recommendation?.price);
    const legacyPrice = legacySide?.price ?? null;
    const priceDeltaRub = canonicalPrice !== null && legacyPrice !== null
      ? Math.round((canonicalPrice - legacyPrice) * 100) / 100
      : null;
    const withinTolerance = priceDeltaRub !== null && Math.abs(priceDeltaRub) <= priceToleranceRub;
    return {
      articleKey,
      platform,
      canonicalPrice,
      legacyPrice,
      priceDeltaRub,
      withinTolerance,
      legacyAction: legacySide?.action || '',
      canonicalReasonCodes: Array.isArray(row?.recommendation?.reason_codes)
        ? row.recommendation.reason_codes
        : []
    };
  });
  const comparable = comparisons.filter((row) => row.legacyPrice !== null);
  const matching = comparable.filter((row) => row.withinTolerance);
  const mismatches = comparable
    .filter((row) => !row.withinTolerance)
    .sort((left, right) => Math.abs(right.priceDeltaRub) - Math.abs(left.priceDeltaRub));
  const canonicalOnlyReady = comparisons.filter((row) => row.legacyPrice === null);
  const canonicalCoverage = Number.isFinite(Number(canonical?.summary?.publishable_coverage))
    ? Number(canonical.summary.publishable_coverage)
    : (canonicalRows.length ? readyRows.length / canonicalRows.length : 0);
  const priceAgreement = comparable.length ? matching.length / comparable.length : 0;
  const gapsPresent = Boolean(gaps && typeof gaps === 'object' && gaps.schema === 'repricer-margin-minmax-gaps-v1');
  const gapBlockedRows = gapsPresent
    ? Math.max(0, Number(gaps?.summary?.blockedRows) || 0)
    : null;
  const canonicalStatus = String(canonical?.summary?.feature_status || canonical?.feature_status || '').trim().toLowerCase();
  const reasons = [];
  if (!gapsPresent) reasons.push('margin_minmax_gaps_report_missing');
  if (gapBlockedRows > 0) reasons.push('required_margin_minmax_gaps_open');
  if (canonicalStatus !== 'ok') reasons.push('canonical_feature_not_ok');
  if (canonicalCoverage < minCanonicalCoverage) reasons.push('canonical_coverage_below_threshold');
  if (!comparable.length) reasons.push('no_comparable_ready_prices');
  if (priceAgreement < minPriceAgreement) reasons.push('legacy_price_agreement_below_threshold');
  const cutoverAllowed = reasons.length === 0;

  return {
    schema: 'repricer-shadow-report-v1',
    generatedAt,
    mode: cutoverAllowed ? 'canonical_active' : 'legacy_shadow',
    cutover_allowed: cutoverAllowed,
    source_snapshot_id: canonical?.snapshot_id || '',
    thresholds: {
      price_tolerance_rub: priceToleranceRub,
      min_canonical_coverage: minCanonicalCoverage,
      min_price_agreement: minPriceAgreement,
      required_margin_minmax_gaps: 0
    },
    summary: {
      canonical_rows: canonicalRows.length,
      canonical_ready_rows: readyRows.length,
      canonical_blocked_rows: Math.max(0, canonicalRows.length - readyRows.length),
      canonical_publishable_coverage: Math.round(canonicalCoverage * 1e6) / 1e6,
      legacy_side_rows: legacyMap.size,
      comparable_ready_rows: comparable.length,
      matching_price_rows: matching.length,
      price_mismatch_rows: mismatches.length,
      canonical_only_ready_rows: canonicalOnlyReady.length,
      price_agreement: Math.round(priceAgreement * 1e6) / 1e6,
      margin_minmax_gap_rows: gapBlockedRows
    },
    blocking_reasons: reasons,
    mismatches: mismatches.slice(0, 200),
    canonical_only_ready: canonicalOnlyReady.slice(0, 200)
  };
}

function buildRepricerShadowReport(options = resolveOptions()) {
  let canonical = readJson(options.canonicalPath, null);
  if (!canonical || canonical.schema !== 'canonical-repricer-v1') {
    canonical = buildCanonicalRepricer(resolveCanonicalOptions({
      'input-dir': options.inputDir,
      'output-dir': options.outputDir,
      'no-write': true,
      'no-fail': true
    })).payload;
  }
  const legacy = readJson(options.legacyPath, { rows: [] });
  const gaps = readJson(options.gapsPath, null);
  const report = compareRepricerSnapshots({
    canonical,
    legacy,
    gaps,
    priceToleranceRub: options.priceToleranceRub,
    minCanonicalCoverage: options.minCanonicalCoverage,
    minPriceAgreement: options.minPriceAgreement
  });
  if (!options.noWrite) writeJson(options.reportPath, report);
  return report;
}

function main() {
  try {
    const options = resolveOptions(parseArgs(process.argv));
    const report = buildRepricerShadowReport(options);
    const summary = report.summary;
    console.log(
      `[repricer-shadow] ${report.mode}: canonical ${summary.canonical_ready_rows}/${summary.canonical_rows}, `
      + `price parity ${summary.matching_price_rows}/${summary.comparable_ready_rows}, `
      + `margin/MIN/MAX gaps ${summary.margin_minmax_gap_rows ?? 'unknown'}`
    );
    if (report.blocking_reasons.length) {
      console.log(`[repricer-shadow] cutover blocked: ${report.blocking_reasons.join(', ')}`);
    }
  } catch (error) {
    console.error(`[repricer-shadow] fatal: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  buildRepricerShadowReport,
  compareRepricerSnapshots,
  legacySideMap,
  parseArgs,
  resolveOptions
};
