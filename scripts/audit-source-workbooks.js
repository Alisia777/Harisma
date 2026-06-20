#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ERROR_MARKERS = ['#REF!', '#VALUE!', '#DIV/0!', '#NAME?'];
const PRICE_ECONOMICS_POLICY = new Set(['price', 'prices', 'economics', 'policy', 'repricer']);
const REPORT_FILE = 'portal_workbook_formula_audit.json';

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

function resolveOptions(args = {}) {
  const root = process.cwd();
  const manifest = path.resolve(args.manifest || path.join(root, 'data', 'portal_source_registry.json'));
  return {
    manifest,
    baseDir: path.resolve(args['base-dir'] || path.dirname(manifest)),
    outputDir: path.resolve(args['output-dir'] || path.join(root, '.portal-truth-output')),
    noWrite: Boolean(args['no-write']),
    noFail: Boolean(args['no-fail'])
  };
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

function workbookSources(manifest = {}) {
  return (manifest.sources || []).filter((source) => String(source.kind || '').toLowerCase() === 'workbook');
}

function usedForPriceEconomicsPolicy(source = {}) {
  const usedFor = Array.isArray(source.used_for) ? source.used_for : [];
  const authoritativeFor = Array.isArray(source.authoritative_for) ? source.authoritative_for : [];
  return [...usedFor, ...authoritativeFor].some((item) => {
    const text = String(item || '').toLowerCase();
    return [...PRICE_ECONOMICS_POLICY].some((needle) => text.includes(needle));
  });
}

function cellText(cell = {}) {
  return [cell.f, cell.v, cell.w].filter((value) => value !== undefined && value !== null).map(String).join(' ');
}

function markerHits(text = '') {
  return ERROR_MARKERS.filter((marker) => text.includes(marker));
}

function inspectWorkbook(source = {}, filePath) {
  const samples = [];
  const byMarker = Object.fromEntries(ERROR_MARKERS.map((marker) => [marker, 0]));
  let externalLinkFormulaCount = 0;
  let formulaCount = 0;
  let cellCount = 0;
  const workbook = XLSX.readFile(filePath, {
    cellFormula: true,
    cellNF: false,
    cellStyles: false,
    cellDates: false,
    WTF: false
  });
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName] || {};
    Object.entries(sheet).forEach(([cellAddress, cell]) => {
      if (cellAddress.startsWith('!') || !cell || typeof cell !== 'object') return;
      cellCount += 1;
      if (cell.f) formulaCount += 1;
      const text = cellText(cell);
      const hits = markerHits(text);
      hits.forEach((marker) => { byMarker[marker] += 1; });
      if (cell.f && /\[[^\]]+\.(xlsx|xlsm|xls|csv)\]/i.test(String(cell.f))) externalLinkFormulaCount += 1;
      if ((hits.length || (cell.f && /\[[^\]]+\.(xlsx|xlsm|xls|csv)\]/i.test(String(cell.f)))) && samples.length < 50) {
        samples.push({
          sheet: sheetName,
          cell: cellAddress,
          formula: cell.f || '',
          value: cell.v ?? null,
          display: cell.w || '',
          markers: hits,
          external_link: Boolean(cell.f && /\[[^\]]+\.(xlsx|xlsm|xls|csv)\]/i.test(String(cell.f))),
          affected_metric_fields: source.authoritative_for || source.used_for || []
        });
      }
    });
  });
  const errorCount = Object.values(byMarker).reduce((sum, count) => sum + count, 0);
  return {
    source_id: source.source_id,
    file: source.file,
    authoritative: source.authoritative !== false,
    used_for: source.used_for || [],
    exists: true,
    cellCount,
    formulaCount,
    byMarker,
    externalLinkFormulaCount,
    errorCount,
    samples,
    status: errorCount || externalLinkFormulaCount ? 'blocked' : 'ok',
    blockingReasons: [
      ...(errorCount ? [`${errorCount} formula/cached-result error markers found`] : []),
      ...(externalLinkFormulaCount ? [`${externalLinkFormulaCount} formulas contain external workbook links that require repair/provenance`] : [])
    ]
  };
}

function auditSourceWorkbooks(options = resolveOptions({})) {
  const manifest = readJson(options.manifest, { sources: [] });
  const sources = workbookSources(manifest).filter(usedForPriceEconomicsPolicy);
  const checks = [];
  sources.forEach((source) => {
    const filePath = path.resolve(options.baseDir, source.file || '');
    const authoritative = source.authoritative !== false;
    if (!fs.existsSync(filePath)) {
      checks.push({
        source_id: source.source_id,
        file: source.file,
        authoritative,
        used_for: source.used_for || [],
        exists: false,
        status: authoritative ? 'blocked' : 'warning',
        blockingReasons: authoritative ? [`authoritative workbook missing: ${source.file}`] : [],
        warnings: authoritative ? [] : [`non-authoritative forensic workbook is not present: ${source.file}`]
      });
      return;
    }
    try {
      const check = inspectWorkbook(source, filePath);
      if (!authoritative && check.status === 'blocked') {
        check.status = 'warning';
        check.warnings = check.blockingReasons.map((reason) => `forensic workbook not authoritative: ${reason}`);
        check.blockingReasons = [];
      }
      checks.push(check);
    } catch (error) {
      checks.push({
        source_id: source.source_id,
        file: source.file,
        authoritative,
        exists: true,
        status: authoritative ? 'blocked' : 'warning',
        blockingReasons: authoritative ? [`cannot inspect workbook: ${error.message}`] : [],
        warnings: authoritative ? [] : [`cannot inspect forensic workbook: ${error.message}`]
      });
    }
  });
  const blockingReasons = checks.flatMap((check) => check.blockingReasons || []);
  const warnings = checks.flatMap((check) => check.warnings || []);
  const report = {
    schema: 'portal-workbook-formula-audit-v1',
    generatedAt: manifest.generatedAt || manifest.version || '',
    manifest: path.relative(process.cwd(), options.manifest),
    status: blockingReasons.length ? 'blocked' : (warnings.length ? 'warning' : 'ok'),
    publish_allowed: blockingReasons.length === 0,
    summary: {
      workbookSources: sources.length,
      blockingChecks: checks.filter((check) => check.status === 'blocked').length,
      warningChecks: checks.filter((check) => check.status === 'warning').length,
      errorMarkers: checks.reduce((sum, check) => sum + (check.errorCount || 0), 0),
      externalLinkFormulas: checks.reduce((sum, check) => sum + (check.externalLinkFormulaCount || 0), 0)
    },
    blockingReasons,
    warnings,
    checks
  };
  if (!options.noWrite) writeJson(path.join(options.outputDir, REPORT_FILE), report);
  return report;
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  try {
    const report = auditSourceWorkbooks(options);
    console.log(`[workbook-audit] ${report.publish_allowed ? 'OK' : 'BLOCKED'}: ${report.summary.workbookSources} workbook sources, ${report.summary.errorMarkers} error markers`);
    if (!report.publish_allowed && !options.noFail) process.exitCode = 1;
  } catch (error) {
    console.error(`[workbook-audit] fatal: ${error.stack || error.message}`);
    if (!options.noFail) process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  auditSourceWorkbooks,
  inspectWorkbook,
  resolveOptions,
  parseArgs,
  usedForPriceEconomicsPolicy
};
