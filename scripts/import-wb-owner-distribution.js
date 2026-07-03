#!/usr/bin/env node

const path = require('path');
const { spawnSync } = require('child_process');

const SOURCE_WORKBOOK_NAME = 'portal_merged_statuses_from_ksenia_minmax.xlsx';

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

function defaultInputPath() {
  return path.join(process.env.USERPROFILE || '', 'Downloads', SOURCE_WORKBOOK_NAME);
}

function main() {
  const args = parseArgs(process.argv);
  const inputPath = args.input || args['input-file'] || args['input-xlsx'] || process.env.ALTEA_KSENIA_MINMAX_XLSX || defaultInputPath();
  const dataDir = args['data-dir'] || args['output-dir'] || args['base-data-dir'] || args['input-dir'] || path.join(process.cwd(), 'data');
  const importerPath = path.join(__dirname, 'import-ksenia-minmax-matrix.js');
  const importerArgs = [importerPath, '--input', inputPath, '--data-dir', dataDir];

  if (args['dry-run']) importerArgs.push('--dry-run');
  if (args['no-backup']) importerArgs.push('--no-backup');
  if (args['skip-rebuild']) importerArgs.push('--skip-rebuild');

  const result = spawnSync(process.execPath, importerArgs, { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exit(result.status ?? 0);
}

main();
