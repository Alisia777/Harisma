#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const nextValue = argv[index + 1];
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
    } else if (nextValue !== undefined && !String(nextValue).startsWith('--')) {
      args[key] = nextValue;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function forwardedArgs(args = {}) {
  const inputPath = path.resolve(args.input || '');
  if (!args.input || !fs.existsSync(inputPath)) {
    throw new Error('Укажите существующий XLSX через --input.');
  }

  const result = [
    path.join(__dirname, 'portal-smart-price-overlay-sync.js'),
    'sync',
    '--input-xlsx', inputPath,
    '--output-dir', path.resolve(args['output-dir'] || path.join(ROOT, '.portal-truth-output', 'price-report-import'))
  ];
  const mappings = {
    overlay: 'overlay-output-file',
    prices: 'prices-output-file',
    repricer: 'repricer-output-file',
    audit: 'audit-output-file',
    workbench: 'workbench-file',
    live: 'live-file',
    'live-repricer': 'live-repricer-file',
    support: 'support-file',
    'expected-date': 'expected-date',
    'max-source-lag-days': 'max-source-lag-days',
    'max-platform-gap-days': 'max-platform-gap-days',
    'min-latest-coverage-ratio': 'min-latest-coverage-ratio'
  };
  Object.entries(mappings).forEach(([source, target]) => {
    if (args[source] === undefined || args[source] === true || args[source] === '') return;
    result.push(`--${target}`, String(args[source]));
  });
  if (args['dry-run']) result.push('--dry-run');
  return result;
}

function main() {
  const args = parseArgs(process.argv);
  const child = spawnSync(process.execPath, forwardedArgs(args), {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
    env: process.env
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`Импорт цен отклонён, код ${child.status}. Активное поколение не изменено.`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  forwardedArgs,
  parseArgs
};
