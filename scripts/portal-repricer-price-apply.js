#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { normalizeKey } = require('./smart-price-contour');

const WB_APPLY_URL = 'https://discounts-prices-api.wildberries.ru/api/v2/upload/task';
const OZON_APPLY_URL = 'https://api-seller.ozon.ru/v1/product/import/prices';

function parseArgs(argv) {
  const args = { command: 'plan' };
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '').trim();
    if (!token) continue;
    if (!token.startsWith('--') && ['plan', 'apply', 'verify'].includes(token)) {
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

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function numberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function planHash(payload) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(stable(payload)))
    .digest('hex');
}

function priceMaps(livePrices = {}) {
  return Object.fromEntries(['wb', 'ozon'].map((platform) => [
    platform,
    new Map((livePrices?.platforms?.[platform]?.rows || []).map((row) => [
      normalizeKey(row?.articleKey || row?.article || ''),
      row
    ]))
  ]));
}

function liveSignalsMap(liveSignals = {}) {
  return new Map((liveSignals?.rows || []).map((row) => [
    `${String(row?.platform || '').trim().toLowerCase()}|${normalizeKey(row?.articleKey || row?.article || '')}`,
    row
  ]));
}

function wbPayload(row, liveRow) {
  const discountPct = numberOrNull(liveRow?.discountPct);
  const target = numberOrNull(row?.recommendation?.price);
  const floor = numberOrNull(row?.policy?.floor);
  const cap = numberOrNull(row?.policy?.cap);
  const nmId = Math.trunc(numberOrNull(liveRow?.nmId) || 0);
  if (!nmId || target === null || discountPct === null || discountPct < 0 || discountPct >= 100) {
    return { error: 'wb_identifier_or_discount_missing' };
  }
  const appliedDiscountPct = Math.round(discountPct);
  const factor = 1 - appliedDiscountPct / 100;
  const exactList = target / factor;
  const candidates = [...new Set([Math.floor(exactList), Math.round(exactList), Math.ceil(exactList)])]
    .filter((value) => value > 0)
    .map((listPrice) => ({
      listPrice,
      sellerPrice: round(listPrice * factor, 2),
      deviation: Math.abs(listPrice * factor - target)
    }))
    .filter((candidate) => (
      (floor === null || candidate.sellerPrice + 1e-9 >= floor)
      && (cap === null || candidate.sellerPrice <= cap + 1e-9)
    ))
    .sort((left, right) => left.deviation - right.deviation);
  if (!candidates.length) return { error: 'wb_discount_step_cannot_fit_corridor' };
  const selected = candidates[0];
  return {
    expectedSellerPrice: selected.sellerPrice,
    payload: {
      nmID: nmId,
      price: selected.listPrice,
      discount: appliedDiscountPct
    }
  };
}

function ozonPayload(row, liveRow) {
  const target = numberOrNull(row?.recommendation?.price);
  const floor = numberOrNull(row?.policy?.floor);
  const offerId = String(liveRow?.offerId || '').trim();
  const productId = Math.trunc(numberOrNull(liveRow?.productId) || 0);
  if ((!offerId && !productId) || target === null || floor === null) {
    return { error: 'ozon_identifier_or_floor_missing' };
  }
  const currentListPrice = numberOrNull(liveRow?.currentListPrice);
  return {
    expectedSellerPrice: target,
    payload: {
      ...(offerId ? { offer_id: offerId } : { product_id: productId }),
      price: String(target),
      old_price: String(currentListPrice !== null && currentListPrice > target ? currentListPrice : 0),
      min_price: String(Math.ceil(floor)),
      currency_code: String(liveRow?.currency || 'RUB'),
      auto_action_enabled: 'UNKNOWN'
    }
  };
}

function buildApplyPlan({
  canonical,
  livePrices,
  liveSignals,
  shadow,
  now = new Date(),
  maxSnapshotAgeMinutes = 120,
  maxRows = 20,
  maxChangePct = 0.5,
  requestedBy = ''
}) {
  const globalBlockers = [];
  const generatedStamp = Date.parse(livePrices?.generatedAt || '');
  const snapshotAgeMinutes = Number.isFinite(generatedStamp)
    ? Math.max(0, (now.getTime() - generatedStamp) / 60000)
    : null;
  if (shadow?.cutover_allowed !== true) globalBlockers.push('shadow_cutover_not_allowed');
  if (canonical?.feature_status !== 'ok') globalBlockers.push('canonical_feature_not_ready');
  if (livePrices?.status !== 'ok') globalBlockers.push('live_price_snapshot_blocked');
  if (snapshotAgeMinutes === null || snapshotAgeMinutes > maxSnapshotAgeMinutes) globalBlockers.push('live_price_snapshot_stale');
  const directPlatforms = new Set(liveSignals?.summary?.directPlatforms || []);
  for (const platform of ['wb', 'ozon']) {
    if (!directPlatforms.has(platform)) globalBlockers.push(`direct_stock_platform_missing:${platform}`);
  }

  const maps = priceMaps(livePrices);
  const stockMap = liveSignalsMap(liveSignals);
  const candidateActions = [];
  const rejected = [];
  const ignored = [];
  const rows = Array.isArray(canonical?.rows) ? canonical.rows : [];
  for (const row of rows) {
    const recommendation = row?.recommendation || {};
    const facts = row?.facts || {};
    const policy = row?.policy || {};
    if (recommendation.status !== 'ready' || recommendation.price === null) continue;
    const currentPrice = numberOrNull(facts.seller_price);
    const targetPrice = numberOrNull(recommendation.price);
    if (currentPrice === null || targetPrice === null || Math.abs(targetPrice - currentPrice) < 0.01) continue;
    const key = `${row.platform}|${normalizeKey(row.article_key)}`;
    const liveRow = maps[row.platform]?.get(normalizeKey(row.article_key));
    const stockRow = stockMap.get(key);
    const reasons = [];
    const changePct = Math.abs((targetPrice - currentPrice) / currentPrice);
    if (!liveRow) reasons.push('live_api_identifier_missing');
    if (facts.price_freshness !== 'fresh' || facts.sources?.seller_price?.file !== 'repricer_live_prices.json') {
      reasons.push('current_price_not_fresh_api');
    }
    if (facts.stock_source_status !== 'trusted_direct' || !stockRow || !/stock_api/.test(String(stockRow.sourceMode || ''))) {
      reasons.push('direct_sku_stock_missing');
    }
    if (stockRow?.oos) reasons.push('sku_is_oos');
    if (policy.margin_guard_required && (
      recommendation.margin_pct === null
      || recommendation.margin_pct + 1e-9 < policy.target_margin_pct
    )) reasons.push('target_margin_violation');
    if (changePct > maxChangePct + 1e-9) reasons.push('apply_change_limit_exceeded');
    if (row?.approval_gate?.type === 'MARGIN_POLICY_REVIEW') reasons.push('margin_policy_review_required');
    const platformPayload = row.platform === 'wb'
      ? wbPayload(row, liveRow)
      : (row.platform === 'ozon' ? ozonPayload(row, liveRow) : { error: 'unsupported_platform' });
    if (platformPayload.error) reasons.push(platformPayload.error);
    if (row.platform === 'ozon' && changePct + 1e-9 < 0.05) {
      ignored.push({ platform: row.platform, articleKey: row.article_key, reason: 'ozon_change_below_api_minimum_5pct' });
      continue;
    }
    if (reasons.length) {
      rejected.push({ platform: row.platform, articleKey: row.article_key, reasons: [...new Set(reasons)] });
      continue;
    }
    candidateActions.push({
      platform: row.platform,
      articleKey: row.article_key,
      currentSellerPrice: currentPrice,
      requestedSellerPrice: targetPrice,
      expectedSellerPrice: platformPayload.expectedSellerPrice,
      changePct: round((targetPrice - currentPrice) / currentPrice),
      lifecycle: facts.lifecycle_key || '',
      approvalId: row?.approval?.id || '',
      apiPayload: platformPayload.payload
    });
  }
  const lifecycleRank = { new: 0, active: 1, exit: 2 };
  const platformRank = { wb: 0, ozon: 1 };
  candidateActions.sort((left, right) => (
    (lifecycleRank[left.lifecycle] ?? 3) - (lifecycleRank[right.lifecycle] ?? 3)
    || (platformRank[left.platform] ?? 2) - (platformRank[right.platform] ?? 2)
    || left.articleKey.localeCompare(right.articleKey, 'ru')
  ));
  const actions = candidateActions.slice(0, maxRows);
  const deferred = candidateActions.slice(maxRows);
  ignored.push(...deferred.map((row) => ({
    platform: row.platform,
    articleKey: row.articleKey,
    reason: 'deferred_batch_limit'
  })));
  const warnings = [];
  if (deferred.length) warnings.push(`actions_deferred_to_next_batch:${deferred.length}`);
  if (rejected.length) warnings.push(`ready_rows_rejected:${rejected.length}`);
  if (!actions.length) globalBlockers.push('no_applicable_price_changes');

  const source = {
    canonicalSnapshotId: canonical?.snapshot_id || '',
    livePriceGeneratedAt: livePrices?.generatedAt || '',
    liveSignalGeneratedAt: liveSignals?.generatedAt || '',
    actions
  };
  const confirmationHash = planHash({
    livePriceAsOfDate: livePrices?.asOfDate || '',
    liveSignalAsOfDate: liveSignals?.asOfDate || '',
    policyVersion: canonical?.policy_version || '',
    economicsPolicyVersion: canonical?.economics_policy_version || '',
    actions
  });
  return {
    schema: 'repricer-price-apply-plan-v1',
    generatedAt: now.toISOString(),
    requestedBy: String(requestedBy || '').trim().slice(0, 320),
    status: globalBlockers.length ? 'blocked' : 'ready',
    applyAllowed: globalBlockers.length === 0,
    confirmationHash,
    source,
    limits: { maxSnapshotAgeMinutes, maxRows, maxChangePct },
    summary: {
      actions: actions.length,
      candidateActions: candidateActions.length,
      deferred: deferred.length,
      wb: actions.filter((row) => row.platform === 'wb').length,
      ozon: actions.filter((row) => row.platform === 'ozon').length,
      rejected: rejected.length,
      ignored: ignored.length
    },
    globalBlockers,
    warnings,
    actions,
    rejected,
    ignored
  };
}

async function requestJson(url, options, label) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status} ${text.slice(0, 300)}`);
  return payload;
}

async function submitApplyPlan(plan, credentials, request = requestJson) {
  if (!plan?.applyAllowed || plan?.status !== 'ready') {
    throw new Error(`price apply plan is blocked: ${(plan?.globalBlockers || []).join(', ')}`);
  }
  const submissions = {};
  const wb = plan.actions.filter((row) => row.platform === 'wb');
  if (wb.length) {
    if (!credentials.wbToken) throw new Error('ALTEA_WB_API_TOKEN is not configured');
    const payload = await request(WB_APPLY_URL, {
      method: 'POST',
      headers: { Authorization: credentials.wbToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: wb.map((row) => row.apiPayload) })
    }, 'WB price apply');
    const uploadId = payload?.data?.id ?? payload?.data?.uploadID;
    if (payload?.error === true || uploadId === null || uploadId === undefined) {
      throw new Error(`WB price apply did not return upload id: ${payload?.errorText || 'unknown response'}`);
    }
    submissions.wb = { uploadId, rows: wb.length };
  }
  const ozon = plan.actions.filter((row) => row.platform === 'ozon');
  if (ozon.length) {
    if (!credentials.ozonClientId || !credentials.ozonApiKey) throw new Error('Ozon API credentials are not configured');
    const payload = await request(OZON_APPLY_URL, {
      method: 'POST',
      headers: {
        'Client-Id': credentials.ozonClientId,
        'Api-Key': credentials.ozonApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prices: ozon.map((row) => row.apiPayload) })
    }, 'Ozon price apply');
    const result = Array.isArray(payload?.result) ? payload.result : [];
    const failed = result.filter((row) => row?.updated !== true || (row?.errors || []).length);
    if (result.length !== ozon.length || failed.length) {
      throw new Error(`Ozon price apply rejected ${failed.length || Math.abs(ozon.length - result.length)} rows`);
    }
    submissions.ozon = { rows: ozon.length, accepted: result.length };
  }
  return submissions;
}

function verifyReceipt(receipt, livePrices, toleranceRub = 0.01) {
  const maps = priceMaps(livePrices);
  const rows = (receipt?.actions || []).map((action) => {
    const liveRow = maps[action.platform]?.get(normalizeKey(action.articleKey));
    const actual = numberOrNull(liveRow?.currentSellerPrice);
    const expected = numberOrNull(action.expectedSellerPrice);
    const matched = actual !== null && expected !== null && Math.abs(actual - expected) <= toleranceRub;
    return {
      platform: action.platform,
      articleKey: action.articleKey,
      expectedSellerPrice: expected,
      actualSellerPrice: actual,
      matched
    };
  });
  return {
    schema: 'repricer-price-apply-verification-v1',
    generatedAt: new Date().toISOString(),
    requestedBy: String(receipt?.requestedBy || '').trim().slice(0, 320),
    confirmationHash: String(receipt?.confirmationHash || '').trim(),
    status: rows.length && rows.every((row) => row.matched) ? 'verified' : 'pending_or_failed',
    summary: {
      rows: rows.length,
      matched: rows.filter((row) => row.matched).length,
      mismatched: rows.filter((row) => !row.matched).length
    },
    rows
  };
}

function resolveOptions(args) {
  const inputDir = path.resolve(args['input-dir'] || path.join(process.cwd(), 'data'));
  const outputDir = path.resolve(args['output-dir'] || path.join(process.cwd(), 'outputs'));
  return {
    command: args.command || 'plan',
    inputDir,
    outputDir,
    planPath: path.resolve(args.plan || path.join(outputDir, 'repricer_price_apply_plan.json')),
    receiptPath: path.resolve(args.receipt || path.join(outputDir, 'repricer_price_apply_receipt.json')),
    verificationPath: path.resolve(args.verification || path.join(outputDir, 'repricer_price_apply_verification.json')),
    confirmation: String(args.confirmation || '').trim(),
    requestedBy: String(args['requested-by'] || '').trim().slice(0, 320),
    maxSnapshotAgeMinutes: Math.max(1, Number(args['max-snapshot-age-minutes'] || 120)),
    maxRows: Math.max(1, Math.trunc(Number(args['max-rows'] || 20))),
    maxChangePct: Math.max(0.01, Number(args['max-change-pct'] || 0.5))
  };
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv));
  if (options.command === 'verify') {
    const receipt = readJson(options.receiptPath);
    if (!receipt) throw new Error(`receipt not found: ${options.receiptPath}`);
    const verification = verifyReceipt(receipt, readJson(path.join(options.inputDir, 'repricer_live_prices.json'), {}));
    writeJson(options.verificationPath, verification);
    console.log(JSON.stringify({ output: options.verificationPath, status: verification.status, summary: verification.summary }, null, 2));
    if (verification.status !== 'verified') process.exitCode = 1;
    return;
  }

  const plan = buildApplyPlan({
    canonical: readJson(path.join(options.inputDir, 'canonical_repricer.json'), {}),
    livePrices: readJson(path.join(options.inputDir, 'repricer_live_prices.json'), {}),
    liveSignals: readJson(path.join(options.inputDir, 'repricer_live_signals.json'), {}),
    shadow: readJson(path.join(options.inputDir, 'repricer_shadow_report.json'), {}),
    maxSnapshotAgeMinutes: options.maxSnapshotAgeMinutes,
    maxRows: options.maxRows,
    maxChangePct: options.maxChangePct,
    requestedBy: options.requestedBy
  });
  writeJson(options.planPath, plan);
  if (options.command === 'plan') {
    console.log(JSON.stringify({
      output: options.planPath,
      status: plan.status,
      summary: plan.summary,
      blockers: plan.globalBlockers,
      confirmationHash: plan.confirmationHash
    }, null, 2));
    return;
  }

  if (process.env.ALTEA_REPRICER_PRICE_APPLY_ENABLED !== 'true') {
    throw new Error('price apply is disabled; set ALTEA_REPRICER_PRICE_APPLY_ENABLED=true on the protected server');
  }
  if (!options.confirmation || options.confirmation !== plan.confirmationHash) {
    throw new Error('confirmation hash does not match the current price plan');
  }
  const submissions = await submitApplyPlan(plan, {
    wbToken: String(process.env.ALTEA_WB_API_TOKEN || '').trim(),
    ozonClientId: String(process.env.ALTEA_OZON_CLIENT_ID || '').trim(),
    ozonApiKey: String(process.env.ALTEA_OZON_API_KEY || '').trim()
  });
  const receipt = {
    schema: 'repricer-price-apply-receipt-v1',
    generatedAt: new Date().toISOString(),
    status: 'submitted_pending_verification',
    requestedBy: options.requestedBy,
    confirmationHash: plan.confirmationHash,
    submissions,
    actions: plan.actions
  };
  writeJson(options.receiptPath, receipt);
  console.log(JSON.stringify({ output: options.receiptPath, status: receipt.status, submissions }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[repricer-price-apply] ${error?.message || error}`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildApplyPlan,
  parseArgs,
  planHash,
  submitApplyPlan,
  verifyReceipt,
  wbPayload,
  ozonPayload
};
