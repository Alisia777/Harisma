#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    const [rawKey, inlineValue] = token.split('=');
    if (!rawKey.startsWith('--')) continue;
    const key = rawKey.replace(/^--/, '');
    const value = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = value;
  }
  return args;
}

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function readSheetLines(workbook) {
  const sheets = {};
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: false
    });
    sheets[sheetName] = rows
      .map((row) => row.map(normalizeText).filter(Boolean).join(' '))
      .map(normalizeText)
      .filter(Boolean);
  }
  return sheets;
}

function flattenText(sheets) {
  return Object.values(sheets).flat().join('\n');
}

function has(pattern, text) {
  return pattern.test(text);
}

function findDefaultSource() {
  const candidates = [
    path.join(os.homedir(), 'Downloads', 'Расчет показателей ИУ (2).xlsx'),
    path.join(os.homedir(), 'Downloads', 'Telegram Desktop', 'Расчет показателей ИУ (2).xlsx'),
    path.join(process.cwd(), '.tmp', 'iu_fix_20260701', 'ozon_iu_logic.xlsx')
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function buildRules(sourcePath) {
  const workbook = XLSX.readFile(sourcePath, { cellDates: false });
  const sheets = readSheetLines(workbook);
  const allText = flattenText(sheets);

  const rules = {
    generatedAt: new Date().toISOString(),
    version: '20260701-ozon-iu-workbook-logic-v1',
    source: {
      workbook: path.basename(sourcePath),
      sha256: fileSha256(sourcePath),
      sheets: workbook.SheetNames
    },
    sheets,
    required: {
      gmvUsesBuyouts: has(/выкуп/i, allText),
      gmvFormulaSalesMinusReturns: has(/выручк/i, allText) && has(/возврат/i, allText) && has(/gmv/i, allText),
      gmvIncludesOzonMarketplaceBuyouts: has(/мп\s*озон|маркетплейс/i, allText),
      drrSourceBalanceReport: has(/баланс/i, allText),
      drrExcludesPremiumPlus: has(/premium\s*plus/i, allText),
      drrExcludesOriginalBadge: has(/бейдж\s*оригинал/i, allText),
      drrFormulaPromotionExpenseOverSalesMinusReturns: has(/продвижение/i, allText)
        && has(/расход/i, allText)
        && has(/продажи/i, allText)
        && has(/возврат/i, allText)
    },
    canonical: {
      gmvRule: 'Ozon IU GMV comes from buyouts: revenue/sales minus revenue returns, including Ozon marketplace/import buyouts from the marketplace buyouts report.',
      drrSourceRule: 'Ozon IU DRR plan/fact is reconciled to the Ozon Balance report.',
      drrSpendRule: 'Ozon IU DRR numerator is Promotion and Expense divided by Sales minus Returns, excluding Premium Plus and Original Badge.',
      exclusions: [
        'Premium Plus',
        'Original Badge'
      ],
      formula: 'Promotion and Expense / (Sales - Returns)'
    }
  };

  const missing = Object.entries(rules.required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`Ozon IU logic workbook is missing required rule markers: ${missing.join(', ')}`);
  }

  return rules;
}

function main() {
  const args = parseArgs(process.argv);
  const sourcePath = path.resolve(args.source || findDefaultSource());
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error('Ozon IU logic workbook was not found. Pass --source "Расчет показателей ИУ (2).xlsx".');
  }
  const outputPath = path.resolve(args.output || path.join(process.cwd(), 'data', 'ozon_iu_logic_rules.json'));
  const rules = buildRules(sourcePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(rules, null, 2) + '\n');
  console.log(JSON.stringify({
    output: outputPath,
    sourceWorkbook: rules.source.workbook,
    sha256: rules.source.sha256,
    sheets: rules.source.sheets,
    required: rules.required
  }, null, 2));
}

main();
