#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const {
  parseArgs,
  readJson,
  writeJson,
  dateKey,
  localDateKey,
  loadSla,
  dataQualityFreshnessMap,
  buildLayerPassport,
  stableStringify,
  sha256Text
} = require('./portal-freshness-core');

const DEFAULT_SLA = path.join(__dirname, 'portal-layer-sla.json');
const OUTPUT_FILE = 'portal_layer_passports.json';

function resolveOptions(args = parseArgs(process.argv)) {
  const root = process.cwd();
  return {
    inputDir: path.resolve(args['input-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || path.join(root, 'data')),
    slaPath: path.resolve(args.sla || DEFAULT_SLA),
    referenceDate: dateKey(args['reference-date'] || args['expected-date']) || '',
    runDate: dateKey(args['run-date']) || '',
    noWrite: Boolean(args['no-write'])
  };
}

function buildPortalLayerPassports(options = resolveOptions()) {
  const sla = loadSla(options.slaPath);
  const dataQuality = readJson(path.join(options.inputDir, 'portal_data_quality.json'), {});
  const context = {
    referenceDate: options.referenceDate || dateKey(dataQuality?.summary?.maxDate) || localDateKey(0),
    runDate: options.runDate || options.referenceDate || '',
    dataQualityFreshness: dataQualityFreshnessMap(dataQuality)
  };
  const passports = Object.entries(sla.layers || {}).map(([layer, policy]) => {
    const sourceFile = policy.sourceFile || `${layer}.json`;
    const sourcePath = path.join(options.inputDir, sourceFile);
    return buildLayerPassport(layer, sourcePath, policy, context);
  }).sort((left, right) => left.layer.localeCompare(right.layer));
  const report = {
    schemaVersion: 'portal-layer-passports-v1',
    generatedAt: `${context.referenceDate}T00:00:00.000Z`,
    referenceDate: context.referenceDate,
    slaVersion: sla.schemaVersion,
    summary: {
      layers: passports.length,
      verified: passports.filter((item) => item.status === 'verified').length,
      warnings: passports.filter((item) => ['warning', 'manual_review'].includes(item.status)).length,
      stale: passports.filter((item) => item.status === 'stale').length,
      unknown: passports.filter((item) => item.status === 'unknown').length,
      blocked: passports.filter((item) => item.status === 'blocked').length
    },
    passports
  };
  report.fingerprint = sha256Text(stableStringify(report.passports.map((passport) => ({
    layer: passport.layer,
    batchId: passport.batchId,
    sourceAsOf: passport.sourceAsOf,
    status: passport.status,
    rowCount: passport.rowCount
  }))));

  if (!options.noWrite) {
    writeJson(path.join(options.outputDir, OUTPUT_FILE), report);
  }
  return report;
}

function main() {
  try {
    const options = resolveOptions();
    const report = buildPortalLayerPassports(options);
    const blocked = report.passports.filter((item) => item.status === 'blocked').length;
    console.log(`[portal-layer-passport] ${report.passports.length} layers, ${blocked} blocked, fingerprint ${report.fingerprint}`);
  } catch (error) {
    console.error(`[portal-layer-passport] fatal: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  OUTPUT_FILE,
  resolveOptions,
  buildPortalLayerPassports
};
