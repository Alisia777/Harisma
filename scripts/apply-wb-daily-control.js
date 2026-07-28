#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !String(next).startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function isoDate(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})$/);
  return match ? match[1] : '';
}

function validateControl(payload) {
  if (payload?.schema !== 'wb-daily-control-v1') {
    throw new Error(`Unsupported WB daily control schema: ${payload?.schema || 'missing'}`);
  }
  const control = payload?.control;
  if (!control || typeof control !== 'object') {
    throw new Error('WB daily control payload is missing control data');
  }
  const daily = Array.isArray(control.daily) ? control.daily : [];
  if (!daily.length) throw new Error('WB daily control has no daily rows');
  if (Number(control.rows) !== daily.length) {
    throw new Error(`WB daily control row count mismatch: ${control.rows} != ${daily.length}`);
  }
  const dates = daily.map((row) => isoDate(row?.date));
  if (dates.some((date) => !date)) throw new Error('WB daily control contains an invalid date');
  if (new Set(dates).size !== dates.length) throw new Error('WB daily control contains duplicate dates');
  const sortedDates = [...dates].sort();
  if (dates.join(',') !== sortedDates.join(',')) throw new Error('WB daily control dates are not sorted');
  if (isoDate(control.from) !== sortedDates[0] || isoDate(control.to) !== sortedDates.at(-1)) {
    throw new Error('WB daily control range does not match its daily rows');
  }
  if (!/^[a-f0-9]{64}$/i.test(String(control.sourceSha256 || ''))) {
    throw new Error('WB daily control source hash is invalid');
  }
  for (const row of daily) {
    for (const key of ['revenueFactGross', 'gmvPlanGross', 'adsFactGross', 'adsPlanGross']) {
      if (!Number.isFinite(Number(row?.[key])) || Number(row[key]) < 0) {
        throw new Error(`WB daily control ${row.date} has invalid ${key}`);
      }
    }
  }
  return {
    ...control,
    sourcePath: '',
    daily: daily.map((row) => ({ ...row })),
    monthly: control.monthly && typeof control.monthly === 'object'
      ? JSON.parse(JSON.stringify(control.monthly))
      : {},
  };
}

function applyControl({ planPath, controlPath, generatedAt = new Date().toISOString() }) {
  const plan = readJson(planPath);
  const payload = readJson(controlPath);
  const control = validateControl(payload);
  plan.generatedAt = generatedAt;
  plan.wbDailyPlan = control;
  writeJson(planPath, plan);
  return {
    planPath,
    controlPath,
    rows: control.daily.length,
    from: control.from,
    to: control.to,
    sourceWorkbook: control.sourceWorkbook || '',
    sourceSha256: control.sourceSha256 || '',
    incompleteControlRows: control.incompleteControlRows || [],
  };
}

function main() {
  const args = parseArgs(process.argv);
  const planPath = path.resolve(args.plan || path.join(process.cwd(), 'data', 'iu_plan.json'));
  const controlPath = path.resolve(args.control || path.join(process.cwd(), 'data', 'wb_iu_daily_control.json'));
  const result = applyControl({ planPath, controlPath });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  applyControl,
  validateControl,
};
