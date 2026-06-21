#!/usr/bin/env node
'use strict';

const path = require('path');
const { parseArgs, resolveOptions, run } = require('./portal-daily-layer-guard');

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  options.noFail = true;
  const { reconciliation } = run(options);
  console.log(`[portal-metric-reconciliation] ${reconciliation.status}: ${reconciliation.summary.metricPassportCount} metric passports, ${reconciliation.summary.blockingChecks} blocking checks`);
  if (reconciliation.status === 'blocked' && !process.argv.includes('--no-fail')) process.exitCode = 1;
}

if (require.main === module) main();
