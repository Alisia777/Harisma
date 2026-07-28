#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { applyControl, validateControl } = require('./apply-wb-daily-control');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-daily-control-'));
const planPath = path.join(tempDir, 'plan.json');
const controlPath = path.join(tempDir, 'control.json');
const generatedAt = '2026-07-28T00:00:00.000Z';
const control = {
  schema: 'wb-daily-control-v1',
  control: {
    status: 'loaded',
    sourceWorkbook: 'control.xlsx',
    sourcePath: '/private/path/must-not-survive.xlsx',
    sourceSha256: 'a'.repeat(64),
    rows: 2,
    from: '2026-07-26',
    to: '2026-07-27',
    daily: [
      {
        date: '2026-07-26',
        revenueFactGross: 100,
        gmvPlanGross: 120,
        adsFactGross: 10,
        adsPlanGross: 9,
      },
      {
        date: '2026-07-27',
        revenueFactGross: 110,
        gmvPlanGross: 125,
        adsFactGross: 11,
        adsPlanGross: 10,
      },
    ],
    monthly: {},
  },
};

fs.writeFileSync(planPath, JSON.stringify({ generatedAt: '', wbDailyPlan: { status: 'missing' } }));
fs.writeFileSync(controlPath, JSON.stringify(control));
const result = applyControl({ planPath, controlPath, generatedAt });
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

assert.strictEqual(result.rows, 2);
assert.strictEqual(plan.generatedAt, generatedAt);
assert.strictEqual(plan.wbDailyPlan.to, '2026-07-27');
assert.strictEqual(plan.wbDailyPlan.sourcePath, '');
assert.strictEqual(plan.wbDailyPlan.daily[1].adsFactGross, 11);

assert.throws(
  () => validateControl({
    ...control,
    control: { ...control.control, rows: 1 },
  }),
  /row count mismatch/,
);
assert.throws(
  () => validateControl({
    ...control,
    control: {
      ...control.control,
      daily: [...control.control.daily].reverse(),
    },
  }),
  /not sorted/,
);

console.log('apply-wb-daily-control selftest ok');
