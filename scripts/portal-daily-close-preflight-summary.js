#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_REPORT = path.join('.portal-truth-output', 'portal_daily_close_preflight.json');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function list(items) {
  return Array.isArray(items) && items.length ? items.join(', ') : 'none';
}

function renderReport(report = {}) {
  const publish = report.publish || {};
  const lines = [
    '## Portal Daily Close Preflight',
    '',
    `- status: \`${report.status || 'missing'}\``,
    `- publish.allowed: \`${publish.allowed === true ? 'true' : 'false'}\``,
    `- cutoffDate: \`${report.cutoffDate || 'not recorded'}\``,
    `- revisionFrom: \`${report.revisionFrom || 'not recorded'}\``,
    `- missing required secrets: \`${list(report.missingSecrets)}\``,
    `- missing required config: \`${list(report.missingConfig)}\``,
    ''
  ];

  if (Array.isArray(publish.blockingReasons) && publish.blockingReasons.length) {
    lines.push('### Blocking Reasons', '');
    publish.blockingReasons.forEach((reason) => lines.push(`- ${reason}`));
    lines.push('');
  }

  const priceSource = report.priceWorkbookSource || {};
  if (priceSource.present === false) {
    lines.push('### Smart Price Source', '');
    lines.push('Configure one of:');
    (priceSource.requiredAnyOf || []).forEach((name) => lines.push(`- \`${name}\``));
    lines.push('');
  }

  const missingExtra = (report.extraMarketplaceSources || []).filter((item) => item && item.present === false);
  if (missingExtra.length) {
    lines.push('### Extra Marketplace Sources', '');
    missingExtra.forEach((item) => {
      lines.push(`- ${item.platform}: ${list((item.requiredAnyOf || []).map((name) => `\`${name}\``))}`);
    });
    lines.push('');
  }

  lines.push('_Only secret/config names are printed. Secret values are never included._');
  return `${lines.join('\n')}\n`;
}

function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const reportPath = path.resolve(String(args.report || DEFAULT_REPORT));
  let text = '';
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    text = renderReport(report);
  } catch (error) {
    text = [
      '## Portal Daily Close Preflight',
      '',
      `Preflight report was not found or could not be parsed: \`${reportPath}\``,
      '',
      '_No secret values were read._',
      ''
    ].join('\n');
  }

  const summaryPath = String(env.GITHUB_STEP_SUMMARY || '').trim();
  if (summaryPath) {
    fs.appendFileSync(summaryPath, text, 'utf8');
  }
  process.stdout.write(text);
  return 0;
}

module.exports = {
  DEFAULT_REPORT,
  list,
  main,
  parseArgs,
  renderReport
};

if (require.main === module) {
  process.exitCode = main();
}
