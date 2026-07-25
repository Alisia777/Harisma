#!/usr/bin/env node

const assert = require('assert');
const {
  financeRetryDelayMs,
  retryHeaderDelayMs,
  waitForFinanceRequestWindow
} = require('./portal-wb-orders-trends-sync');

assert.strictEqual(retryHeaderDelayMs('59', 0), 60_000);
assert.strictEqual(retryHeaderDelayMs('Thu, 01 Jan 1970 00:01:00 GMT', 0), 61_000);
assert.strictEqual(retryHeaderDelayMs('1700000060', 1_700_000_000_000), 61_000);
assert.strictEqual(financeRetryDelayMs({ 'retry-after': '10' }, 1, 61_000, 0), 61_000);
assert.strictEqual(financeRetryDelayMs({ 'retry-after': '90' }, 1, 61_000, 0), 91_000);

(async () => {
  let nowMs = 1_000;
  const waits = [];
  const options = { financeMinIntervalMs: 61_000, financeLastRequestAt: 0 };
  const now = () => nowMs;
  const sleeper = async (ms) => {
    waits.push(ms);
    nowMs += ms;
  };

  assert.strictEqual(await waitForFinanceRequestWindow(options, now, sleeper), 0);
  nowMs += 10_000;
  assert.strictEqual(await waitForFinanceRequestWindow(options, now, sleeper), 51_000);
  assert.deepStrictEqual(waits, [51_000]);
  assert.strictEqual(options.financeLastRequestAt, 62_000);
  console.log('portal-wb-finance-rate-limit selftest ok');
})().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
