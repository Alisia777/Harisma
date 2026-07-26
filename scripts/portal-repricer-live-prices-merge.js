#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeKey } = require('./smart-price-contour');

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

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`Unable to read price snapshot ${filePath}: ${error.message}`);
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function isoDate(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function numberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstPositive(...values) {
  for (const value of values) {
    const parsed = numberOrNull(value);
    if (parsed !== null && parsed > 0) return parsed;
  }
  return null;
}

function round(value, digits = 2) {
  const parsed = numberOrNull(value);
  if (parsed === null) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function platformKey(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
  if (['ya', 'ym', 'yandex', 'yandexmarket', 'ямаркет'].includes(raw)) return 'ym';
  return raw;
}

function normalizedArticle(value) {
  return normalizeKey(String(value || '').trim());
}

function sourceRowsForPayload(payload, rowCount) {
  const explicit = numberOrNull(
    payload?.priceApiSnapshot?.apiPricedOfferCount
    ?? payload?.summary?.sourceRows
  );
  return explicit !== null && explicit >= rowCount ? Math.trunc(explicit) : rowCount;
}

function unresolvedRowsForPayload(payload, platform) {
  const explicit = Array.isArray(payload?.unresolved)
    ? payload.unresolved.filter((row) => platformKey(row?.platform || row?.marketplace || platform) === platform)
    : [];
  const unmatchedIds = Array.isArray(payload?.priceApiSnapshot?.unmatchedOfferIds)
    ? payload.priceApiSnapshot.unmatchedOfferIds
    : [];
  const duplicateOffers = Array.isArray(payload?.priceApiSnapshot?.duplicateMappedOffers)
    ? payload.priceApiSnapshot.duplicateMappedOffers
    : [];
  const seen = new Set(explicit.map((row) => String(row?.offerId || row?.id || '').trim()).filter(Boolean));
  return explicit.concat(duplicateOffers
    .map((row) => ({
      platform,
      marketplace: platform,
      articleKey: String(row?.articleKey || '').trim(),
      offerId: String(row?.secondaryOfferId || '').trim(),
      selectedOfferId: String(row?.selectedOfferId || '').trim(),
      reason: 'duplicate_non_primary'
    }))
    .filter((row) => row.offerId && !seen.has(row.offerId)), unmatchedIds
    .map((offerId) => String(offerId || '').trim())
    .filter((offerId) => offerId && !seen.has(offerId))
    .map((offerId) => ({
      platform,
      marketplace: platform,
      offerId,
      reason: 'unmapped'
    })));
}

function normalizeAdditionalPlatform(payload, rawPlatform, expectedDate) {
  const platform = platformKey(rawPlatform);
  const platformPayload = payload?.platforms?.[rawPlatform] || {};
  const rows = Array.isArray(platformPayload?.rows) ? platformPayload.rows : [];
  const blockingReasons = [];
  const payloadDate = isoDate(platformPayload.asOfDate || payload?.asOfDate || payload?.generatedAt);
  if (!platform) blockingReasons.push('additional snapshot contains an empty platform key');
  if (!payloadDate) blockingReasons.push(`${platform || rawPlatform}: additional snapshot has no as-of date`);
  if (payloadDate && payloadDate !== expectedDate) {
    blockingReasons.push(`${platform || rawPlatform}: snapshot date ${payloadDate} does not match ${expectedDate}`);
  }
  if (!rows.length) blockingReasons.push(`${platform || rawPlatform}: additional snapshot has no price rows`);

  const normalizedRows = [];
  const seen = new Set();
  rows.forEach((row, index) => {
    const articleKey = String(row?.articleKey || row?.article_key || row?.article || row?.sku || '').trim();
    const articleToken = normalizedArticle(articleKey);
    const price = firstPositive(row?.currentSellerPrice, row?.currentFillPrice, row?.currentPrice, row?.price);
    const rowDate = isoDate(
      row?.currentPriceDate
      || row?.valueDate
      || row?.historyFreshnessDate
      || payloadDate
    );
    const key = `${platform}|${articleToken}`;
    if (!articleToken) {
      blockingReasons.push(`${platform || rawPlatform}: row ${index + 1} has no article key`);
      return;
    }
    if (price === null) {
      blockingReasons.push(`${platform || rawPlatform}: ${articleKey} has no positive seller price`);
      return;
    }
    if (rowDate !== expectedDate) {
      blockingReasons.push(`${platform || rawPlatform}: ${articleKey} price date ${rowDate || 'missing'} does not match ${expectedDate}`);
      return;
    }
    if (seen.has(key)) {
      blockingReasons.push(`${platform || rawPlatform}: duplicate article ${articleKey}`);
      return;
    }
    seen.add(key);
    const clientPrice = firstPositive(
      row?.currentClientPrice,
      row?.clientPrice,
      platform === 'ym' ? price : null
    );
    const listPrice = firstPositive(
      row?.currentListPrice,
      row?.listPrice,
      row?.discountBase,
      row?.price?.discountBase
    );
    normalizedRows.push({
      ...row,
      id: `${platform}|${articleToken}`,
      platform,
      marketplace: platform,
      articleKey,
      normalizedArticleKey: articleToken,
      currentFillPrice: round(price),
      currentPrice: round(price),
      currentSellerPrice: round(price),
      currentClientPrice: round(clientPrice),
      currentListPrice: round(listPrice),
      currentPriceDate: expectedDate,
      valueDate: expectedDate,
      historyFreshnessDate: expectedDate,
      asOfDate: expectedDate,
      retrievedAt: String(row?.retrievedAt || payload?.generatedAt || `${expectedDate}T00:00:00.000Z`),
      sourceStatus: String(row?.sourceStatus || 'direct_api'),
      currentSellerPriceSource: String(
        row?.currentSellerPriceSource
        || row?.currentPriceSource
        || payload?.source
        || `${platform}-prices-api`
      ),
      currentPriceSource: String(
        row?.currentPriceSource
        || row?.currentSellerPriceSource
        || payload?.source
        || `${platform}-prices-api`
      ),
      currentSellerPriceFile: 'repricer_live_prices.json',
      daily: [{
        date: expectedDate,
        price: round(price),
        clientPrice: round(clientPrice),
        sppPct: null,
        source: String(row?.currentPriceSource || payload?.source || `${platform}-prices-api`)
      }]
    });
  });

  const unresolved = unresolvedRowsForPayload(payload, platform);
  const sourceRows = sourceRowsForPayload(payload, normalizedRows.length + unresolved.length);
  const mappedRows = normalizedRows.length;
  const unresolvedRows = Math.max(unresolved.length, sourceRows - mappedRows);
  return {
    platform,
    label: String(platformPayload.label || rawPlatform),
    source: String(platformPayload.source || payload?.sourceFile || payload?.source || ''),
    asOfDate: expectedDate,
    rows: normalizedRows,
    unresolved,
    blockingReasons,
    summary: {
      sourceRows,
      mappedRows,
      unresolvedRows,
      mappedRatio: sourceRows > 0 ? round(mappedRows / sourceRows, 6) : 0,
      unresolvedRatio: sourceRows > 0 ? round(unresolvedRows / sourceRows, 6) : 0,
      missingSellerPriceRows: 0,
      ambiguousRows: unresolved.filter((row) => row?.reason === 'ambiguous').length,
      unmappedRows: unresolved.filter((row) => row?.reason === 'unmapped').length,
      duplicateNonPrimaryRows: unresolved.filter((row) => row?.reason === 'duplicate_non_primary').length,
      protectedExpectedRows: null,
      protectedMappedRows: null,
      protectedMissingRows: null,
      protectedCoverage: null,
      protectedMissingRatio: null,
      protectedMissingKeys: []
    }
  };
}

function duplicatePlatformArticles(platforms = {}) {
  const counts = new Map();
  Object.entries(platforms || {}).forEach(([rawPlatform, payload]) => {
    const platform = platformKey(rawPlatform);
    (Array.isArray(payload?.rows) ? payload.rows : []).forEach((row) => {
      const article = normalizedArticle(row?.articleKey || row?.article_key || row?.article);
      if (!platform || !article) return;
      const key = `${platform}|${article}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
}

function mergeLivePricePayloads(basePayload, additionalPayloads, options = {}) {
  const expectedDate = isoDate(options.expectedDate || basePayload?.asOfDate || basePayload?.generatedAt);
  const requiredPlatforms = new Set((options.requiredPlatforms || []).map(platformKey).filter(Boolean));
  const payload = JSON.parse(JSON.stringify(basePayload || {}));
  payload.summary = payload.summary && typeof payload.summary === 'object' ? payload.summary : {};
  payload.summary.platforms = payload.summary.platforms && typeof payload.summary.platforms === 'object'
    ? payload.summary.platforms
    : {};
  payload.platforms = payload.platforms && typeof payload.platforms === 'object' ? payload.platforms : {};
  payload.unresolved = Array.isArray(payload.unresolved) ? payload.unresolved : [];
  payload.sourceErrors = payload.sourceErrors && typeof payload.sourceErrors === 'object' ? payload.sourceErrors : {};
  payload.blockingReasons = Array.isArray(payload.blockingReasons) ? payload.blockingReasons : [];
  payload.additionalSources = [];

  if (!expectedDate) payload.blockingReasons.push('base snapshot has no as-of date');
  if (payload.status && payload.status !== 'ok') payload.blockingReasons.push('base snapshot status is not ok');
  const baseDate = isoDate(payload.asOfDate || payload.generatedAt);
  if (expectedDate && baseDate && baseDate !== expectedDate) {
    payload.blockingReasons.push(`base snapshot date ${baseDate} does not match ${expectedDate}`);
  }

  (additionalPayloads || []).forEach((entry) => {
    const additional = entry?.payload || entry || {};
    const sourceFile = String(entry?.sourceFile || '');
    const platformEntries = Object.keys(additional?.platforms || {});
    if (!platformEntries.length) {
      payload.blockingReasons.push(`${sourceFile || 'additional snapshot'} has no platforms`);
      return;
    }
    platformEntries.forEach((rawPlatform) => {
      const normalized = normalizeAdditionalPlatform(additional, rawPlatform, expectedDate);
      const platform = normalized.platform;
      if (payload.platforms[platform]) {
        payload.blockingReasons.push(`${platform}: additional snapshot would overwrite an existing platform`);
        return;
      }
      payload.blockingReasons.push(...normalized.blockingReasons);
      if (normalized.blockingReasons.length) return;
      payload.platforms[platform] = {
        label: normalized.label,
        source: normalized.source,
        asOfDate: expectedDate,
        rows: normalized.rows
      };
      payload.summary.platforms[platform] = normalized.summary;
      payload.summary.sourceRows = Number(payload.summary.sourceRows || 0) + normalized.summary.sourceRows;
      payload.summary.mappedRows = Number(payload.summary.mappedRows || 0) + normalized.summary.mappedRows;
      payload.summary.unresolvedRows = Number(payload.summary.unresolvedRows || 0) + normalized.summary.unresolvedRows;
      payload.unresolved.push(...normalized.unresolved);
      payload.additionalSources.push({
        platform,
        sourceFile,
        schema: String(additional?.schema || ''),
        generatedAt: String(additional?.generatedAt || ''),
        asOfDate: expectedDate,
        source: String(additional?.source || normalized.source || ''),
        sourceRows: normalized.summary.sourceRows,
        mappedRows: normalized.summary.mappedRows,
        unresolvedRows: normalized.summary.unresolvedRows
      });
    });
  });

  requiredPlatforms.forEach((platform) => {
    const rows = payload?.platforms?.[platform]?.rows;
    if (!Array.isArray(rows) || !rows.length) {
      payload.blockingReasons.push(`${platform}: required additional platform is missing`);
    }
  });

  const duplicates = duplicatePlatformArticles(payload.platforms);
  payload.duplicates = duplicates;
  payload.summary.duplicatePlatformArticleKeys = duplicates.length;
  if (duplicates.length) payload.blockingReasons.push(`duplicate platform/article keys: ${duplicates.length}`);
  payload.blockingReasons = [...new Set(payload.blockingReasons.filter(Boolean))];
  payload.status = payload.blockingReasons.length ? 'blocked' : 'ok';
  payload.asOfDate = expectedDate || payload.asOfDate;
  if (payload.additionalSources.length) {
    const sourceNames = [
      String(payload.source || '').trim(),
      ...payload.additionalSources.map((entry) => entry.source).filter(Boolean)
    ].filter(Boolean);
    payload.source = [...new Set(sourceNames)].join(' + ');
    payload.note = 'Server-side current seller-price snapshot merged only from date-aligned direct cabinet APIs.';
  }
  return payload;
}

function resolveOptions(args) {
  const root = process.cwd();
  const basePath = path.resolve(args.base || args.input || path.join(root, 'data', 'repricer_live_prices.json'));
  return {
    basePath,
    outputPath: path.resolve(args.output || basePath),
    additionalPaths: splitList(args.additional || args['additional-price-file']).map((filePath) => path.resolve(filePath)),
    expectedDate: isoDate(args['as-of-date']),
    requiredPlatforms: splitList(args['required-platform'] || args['required-platforms']),
    strict: Boolean(args.strict)
  };
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  if (!options.additionalPaths.length) throw new Error('At least one --additional-price-file is required');
  const basePayload = readJson(options.basePath);
  const additionalPayloads = options.additionalPaths.map((sourceFile) => ({
    sourceFile,
    payload: readJson(sourceFile)
  }));
  const payload = mergeLivePricePayloads(basePayload, additionalPayloads, options);
  writeJson(options.outputPath, payload);
  const prefix = payload.status === 'ok' ? '[repricer-live-prices-merge] OK' : '[repricer-live-prices-merge] BLOCKED';
  console.log(`${prefix}: ${payload.summary.mappedRows}/${payload.summary.sourceRows} mapped across ${Object.keys(payload.platforms).length} platforms`);
  if (options.strict && payload.status !== 'ok') process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[repricer-live-prices-merge] ${error.stack || error.message || String(error)}`);
    process.exitCode = 1;
  }
}

module.exports = {
  duplicatePlatformArticles,
  mergeLivePricePayloads,
  normalizeAdditionalPlatform,
  parseArgs,
  platformKey,
  resolveOptions
};
