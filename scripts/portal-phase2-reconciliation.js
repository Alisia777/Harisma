#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REPORT_FILE = 'portal_phase2_reconciliation.json';

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) continue;
    const equalIndex = token.indexOf('=');
    const key = token.slice(2, equalIndex >= 0 ? equalIndex : undefined);
    if (equalIndex >= 0) {
      args[key] = token.slice(equalIndex + 1);
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
  return {
    inputDir: path.resolve(args['input-dir'] || path.join(root, 'data')),
    baseDataDir: path.resolve(args['base-data-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || args['input-dir'] || path.join(root, 'data')),
    noFail: Boolean(args['no-fail'])
  };
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function readLayer(options, fileName) {
  const inputPath = path.join(options.inputDir, fileName);
  const basePath = path.join(options.baseDataDir, fileName);
  const filePath = fs.existsSync(inputPath) ? inputPath : basePath;
  return { filePath, payload: readJsonIfExists(filePath) };
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function numberOrZero(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['rows', 'items', 'skus', 'data']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function normalizeToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-zа-я0-9]+/gi, '');
}

function platformKey(value = '') {
  const raw = normalizeToken(value);
  if (['wb', 'wildberries'].includes(raw)) return 'wb';
  if (['ozon', 'oz'].includes(raw)) return 'ozon';
  if (['ym', 'ya', 'yandex', 'yandexmarket', 'яндекс', 'ямаркет'].includes(raw)) return 'ym';
  return raw || 'all';
}

function checkOrder(options) {
  const order = readLayer(options, 'order_procurement.json');
  const wb = readLayer(options, 'order_procurement_wb.json');
  const ozon = readLayer(options, 'order_procurement_ozon.json');
  const ym = readLayer(options, 'order_procurement_ym.json');
  const rows = rowsOf(order.payload);
  const detailRows = {
    wb: rowsOf(wb.payload).length,
    ozon: rowsOf(ozon.payload).length,
    ym: rowsOf(ym.payload).length
  };
  const platformCounts = { wb: 0, ozon: 0, ym: 0 };
  const formulaErrors = [];
  const availableErrors = [];
  const horizonErrors = [];
  const detailHorizonErrors = [];
  const sampleRows = [];
  let transitOrRequestRows = 0;
  rows.forEach((row, index) => {
    const platform = platformKey(row.platformKey || row.platform);
    if (Object.prototype.hasOwnProperty.call(platformCounts, platform)) platformCounts[platform] += 1;
    const inStock = numberOrZero(row.inStock);
    const inTransit = numberOrZero(row.inTransit);
    const inRequest = numberOrZero(row.inRequest);
    const available = inStock + inTransit + inRequest;
    const avgDaily = numberOrZero(row.avgDaily);
    const safetyStock = numberOrZero(row.safetyStock);
    const rawNeed30 = avgDaily > 0 ? Math.ceil(avgDaily * 30 + safetyStock - available) : 0;
    const targetNeed30 = row.needSuppressedByLifecycle ? 0 : Math.max(0, rawNeed30);
    if (inTransit > 0 || inRequest > 0) transitOrRequestRows += 1;
    if (numberOrZero(row.available) !== available) availableErrors.push({ index, article: row.article || row.articleKey, actual: row.available, expected: available });
    if (row.rawNeed30 === undefined || row.targetNeed30 === undefined || numberOrZero(row.targetHorizonDays) !== 30) {
      horizonErrors.push({ index, article: row.article || row.articleKey, targetHorizonDays: row.targetHorizonDays });
    }
    if (numberOrZero(row.rawNeed30) !== rawNeed30 || numberOrZero(row.targetNeed30) !== targetNeed30) {
      formulaErrors.push({ index, article: row.article || row.articleKey, rawNeed30: row.rawNeed30, targetNeed30: row.targetNeed30, expectedRawNeed30: rawNeed30, expectedTargetNeed30: targetNeed30 });
    }
    if (sampleRows.length < 20) {
      sampleRows.push({
        platform,
        article: row.article || row.articleKey,
        inStock,
        inTransit,
        inRequest,
        available: row.available,
        avgDaily,
        rawNeed30: row.rawNeed30,
        targetNeed30: row.targetNeed30,
        expectedRawNeed30: rawNeed30,
        expectedTargetNeed30: targetNeed30
      });
    }
  });
  const blockingReasons = [];
  const warnings = [];
  if (!rows.length) blockingReasons.push('order_procurement rows are empty');
  if (availableErrors.length) blockingReasons.push(`${availableErrors.length} rows fail available=inStock+inTransit+inRequest`);
  if (horizonErrors.length) blockingReasons.push(`${horizonErrors.length} rows are missing target horizon 30 fields`);
  if (formulaErrors.length) blockingReasons.push(`${formulaErrors.length} rows fail need30 formula`);
  if (detailRows.ym && platformCounts.ym < detailRows.ym) blockingReasons.push(`combined Yandex rows ${platformCounts.ym} < detail Yandex rows ${detailRows.ym}`);
  [
    ...rowsOf(wb.payload),
    ...rowsOf(ozon.payload),
    ...rowsOf(ym.payload)
  ].forEach((row, index) => {
    if (row.rawNeed30 === undefined || row.targetNeed30 === undefined || numberOrZero(row.targetHorizonDays) !== 30) {
      detailHorizonErrors.push({ index, platform: row.platformKey || row.platform, article: row.article || row.articleKey });
    }
  });
  if (detailHorizonErrors.length) blockingReasons.push(`${detailHorizonErrors.length} detail rows are missing target horizon 30 fields`);
  if (!transitOrRequestRows) warnings.push('no rows with inTransit/inRequest found in current cut');
  return {
    status: blockingReasons.length ? 'blocked' : (warnings.length ? 'warning' : 'ok'),
    blockingReasons,
    warnings,
    source: order.filePath,
    rows: rows.length,
    platformCounts,
    detailRows,
    transitOrRequestRows,
    availableErrorCount: availableErrors.length,
    horizonErrorCount: horizonErrors.length,
    detailHorizonErrorCount: detailHorizonErrors.length,
    formulaErrorCount: formulaErrors.length,
    samples: {
      formulaErrors: formulaErrors.slice(0, 20),
      availableErrors: availableErrors.slice(0, 20),
      horizonErrors: horizonErrors.slice(0, 20),
      spotCheckRows: sampleRows
    }
  };
}

function checkSkuMatrix(options) {
  const matrix = readLayer(options, 'sku_matrix.json');
  const payload = matrix.payload || {};
  const items = rowsOf(payload);
  const aliasConflicts = Array.isArray(payload.aliasConflicts) ? payload.aliasConflicts : [];
  const skuTokenConflicts = Array.isArray(payload.skuTokenConflicts) ? payload.skuTokenConflicts : [];
  const ownerConflictItems = items.filter((item) => (item.ownerConflicts || []).length);
  const hiddenOwnerConflicts = ownerConflictItems.filter((item) => !(item.problemStates || []).includes('owner_platform_conflict'));
  const blockingReasons = [];
  const warnings = [];
  if (aliasConflicts.length) blockingReasons.push(`${aliasConflicts.length} alias collisions detected`);
  if (skuTokenConflicts.length) blockingReasons.push(`${skuTokenConflicts.length} SKU token collisions detected`);
  if (hiddenOwnerConflicts.length) blockingReasons.push(`${hiddenOwnerConflicts.length} owner conflicts are hidden from problemStates`);
  if (ownerConflictItems.length && !hiddenOwnerConflicts.length) warnings.push(`${ownerConflictItems.length} owner conflicts are visible as warnings`);
  return {
    status: blockingReasons.length ? 'blocked' : (warnings.length ? 'warning' : 'ok'),
    blockingReasons,
    warnings,
    source: matrix.filePath,
    rows: items.length,
    aliasCount: numberOrZero(payload.summary?.aliasCount),
    aliasConflictCount: aliasConflicts.length,
    skuTokenConflictCount: skuTokenConflicts.length,
    ownerConflictCount: ownerConflictItems.length,
    samples: {
      aliasConflicts: aliasConflicts.slice(0, 20),
      skuTokenConflicts: skuTokenConflicts.slice(0, 20),
      ownerConflicts: ownerConflictItems.slice(0, 20).map((item) => ({
        articleKey: item.articleKey,
        owner: item.owner,
        platformOwners: item.platformOwners,
        ownerConflicts: item.ownerConflicts,
        problemStates: item.problemStates
      }))
    }
  };
}

function checkExecutiveCode() {
  const filePath = path.resolve(__dirname, '..', 'portal-executive-direct-fact-guard.js');
  const indexPath = path.resolve(__dirname, '..', 'index.html');
  const text = fs.readFileSync(filePath, 'utf8');
  const indexText = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
  const blockingReasons = [];
  const scalePlanCalls = (text.match(/executiveFunnelScalePlanBucket\(/g) || []).length;
  const scaleFinancialCalls = (text.match(/executiveFunnelScaleBucketFinancials\(/g) || []).length;
  const loadedAfterProtectedCore = indexText.indexOf('portal-executive-direct-fact-guard.js') > indexText.indexOf('app-core-10.js');
  if (/payrollFactAllocationBasis\s*=\s*['"]plan_share['"]/.test(text) || /payrollFactAllocated\s*=\s*true/.test(text)) {
    blockingReasons.push('plan_share employee fact allocation is present');
  }
  if (/payrollControlScaled\s*=\s*true/.test(text)) blockingReasons.push('payroll control scaled mutation is present');
  if (scalePlanCalls > 1) blockingReasons.push('scale plan bucket is called outside guarded definition');
  if (scaleFinancialCalls > 1) blockingReasons.push('scale bucket financials is called outside guarded definition');
  if (!text.includes('direct_fact_only')) blockingReasons.push('direct_fact_only marker is absent');
  if (!loadedAfterProtectedCore) blockingReasons.push('direct fact guard is not loaded after protected executive core');
  return {
    status: blockingReasons.length ? 'blocked' : 'ok',
    blockingReasons,
    warnings: [],
    source: filePath,
    directFactOnly: text.includes('direct_fact_only'),
    loadedAfterProtectedCore,
    scalePlanCalls,
    scaleFinancialCalls
  };
}

function checkOosTaskCode() {
  const app11Path = path.resolve(__dirname, '..', 'app-core-11.js');
  const app02Path = path.resolve(__dirname, '..', 'app-core-02.js');
  const text = fs.readFileSync(app11Path, 'utf8');
  const storageText = fs.readFileSync(app02Path, 'utf8');
  const saveStart = text.indexOf('async function oosControlSaveTask');
  const saveEnd = text.indexOf('function oosControlRiskAmount', saveStart);
  const taskForStart = text.indexOf('function oosControlTaskFor');
  const taskForEnd = text.indexOf('function oosControlTaskStatusLabel', taskForStart);
  const saveBlock = saveStart >= 0 && saveEnd > saveStart ? text.slice(saveStart, saveEnd) : '';
  const taskForBlock = taskForStart >= 0 && taskForEnd > taskForStart ? text.slice(taskForStart, taskForEnd) : '';
  const blockingReasons = [];
  const markers = {
    hasStableIssueKey: text.includes('function oosControlStableIssueKey'),
    hasStableMarker: saveBlock.includes('[oos-stable:'),
    hasLegacyMarker: saveBlock.includes('[oos:'),
    taskSourceAuto: /source:\s*['"]auto['"]/.test(saveBlock),
    taskNormalizeAuto: /normalizeTask\([^]*,\s*['"]auto['"]\)/.test(saveBlock),
    taskForStableMarker: taskForBlock.includes('oosControlTaskMarkers'),
    localAutoOosPersistent: storageText.includes("autoCode || '').trim().toLowerCase() === 'oos_control'")
  };
  if (!markers.hasStableIssueKey || !markers.hasStableMarker) blockingReasons.push('stable OOS task marker is absent');
  if (!markers.hasLegacyMarker) blockingReasons.push('legacy OOS issue marker is absent');
  if (!markers.taskSourceAuto || !markers.taskNormalizeAuto) blockingReasons.push('OOS task is not created as source=auto');
  if (/id:\s*row\.taskId\s*\|\|/.test(saveBlock)) blockingReasons.push('legacy row.taskId is used before stable/existing id');
  if (!markers.taskForStableMarker) blockingReasons.push('OOS task lookup does not check stable markers');
  if (!markers.localAutoOosPersistent) blockingReasons.push('local storage normalization drops auto OOS tasks');
  return {
    status: blockingReasons.length ? 'blocked' : 'ok',
    blockingReasons,
    warnings: [],
    source: app11Path,
    markers
  };
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const checks = {
    orderProcurement: checkOrder(options),
    skuMatrix: checkSkuMatrix(options),
    executiveDirectFact: checkExecutiveCode(),
    oosAutoTask: checkOosTaskCode()
  };
  const blockingReasons = Object.values(checks).flatMap((check) => check.blockingReasons || []);
  const warnings = Object.values(checks).flatMap((check) => check.warnings || []);
  const report = {
    schema: 'portal-phase2-reconciliation-v1',
    generatedAt: new Date().toISOString(),
    status: blockingReasons.length ? 'blocked' : (warnings.length ? 'warning' : 'ok'),
    summary: {
      blockingChecks: Object.values(checks).filter((check) => check.status === 'blocked').length,
      warningChecks: Object.values(checks).filter((check) => check.status === 'warning').length,
      blockingReasons,
      warnings
    },
    checks
  };
  const outputPath = path.join(options.outputDir, REPORT_FILE);
  writeJson(outputPath, report);
  console.log(`[portal-phase2-reconciliation] ${report.status}: ${report.summary.blockingChecks} blocking, ${report.summary.warningChecks} warning; ${outputPath}`);
  if (report.status === 'blocked' && !options.noFail) process.exitCode = 1;
}

if (require.main === module) main();
