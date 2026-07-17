#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'portal-team-runtime-hotfix.js'), 'utf8');

const constantsStart = source.indexOf('const POST_BOOT_RECONCILE_POLL_MS');
const markerDeclaration = source.indexOf('let earlyTeamStorageCommitted = false;', constantsStart);
const constantsEnd = source.indexOf('\n', markerDeclaration) + 1;
const reconcileStart = source.indexOf('async function reconcileTeamStateAfterPrimaryBootHotfix()');
const reconcileSectionEnd = source.indexOf('function bindAutoPullHotfix()', reconcileStart);

assert(constantsStart >= 0, 'Post-boot reconcile constants must exist');
assert(markerDeclaration > constantsStart, 'Early team-storage marker must exist');
assert(reconcileStart > markerDeclaration, 'Post-boot reconcile function must exist');
assert(reconcileSectionEnd > reconcileStart, 'Post-boot reconcile scheduler must exist');

const testableSource = `
  ${source.slice(constantsStart, constantsEnd)}
  ${source.slice(reconcileStart, reconcileSectionEnd)}
  window.__bootRaceTest = {
    reconcile: reconcileTeamStateAfterPrimaryBootHotfix,
    schedule: schedulePostBootTeamReconcileHotfix,
    getDone: () => postBootTeamReconcileDone,
    setDone: (value) => { postBootTeamReconcileDone = Boolean(value); },
    getMarker: () => earlyTeamStorageCommitted,
    setMarker: (value) => { earlyTeamStorageCommitted = Boolean(value); }
  };
`;

function createHarness(options = {}) {
  const state = options.state || {
    boot: { dataReady: false },
    team: { mode: 'ready' }
  };
  const wrapperCalls = [];
  const fallbackCalls = [];
  const timers = [];
  let pullResult = Object.prototype.hasOwnProperty.call(options, 'pullResult')
    ? options.pullResult
    : { remoteEmpty: false, softErrors: [] };
  let remoteEnabled = options.remoteEnabled !== false;
  let remoteStoreReady = options.remoteStoreReady !== false;

  const context = {
    console: {
      log() {},
      warn() {},
      error() {}
    },
    appState: () => state,
    canUseRemote: () => remoteEnabled,
    hasRemoteStoreHotfix: () => remoteStoreReady,
    pullRemoteStateHotfix: async function (...args) {
      fallbackCalls.push({ args, thisIsWindow: this === context.window });
      return pullResult;
    }
  };
  context.window = context;
  context.window.pullRemoteState = async function (...args) {
    wrapperCalls.push({ args, thisIsWindow: this === context.window });
    return pullResult;
  };
  context.window.setTimeout = (callback, delay) => {
    timers.push({ callback, delay });
    return timers.length;
  };

  vm.createContext(context);
  vm.runInContext(testableSource, context, { filename: 'portal-team-runtime-hotfix.boot-race.vm.js' });
  context.__bootRaceTest.setMarker(Boolean(options.marker));

  return {
    api: context.__bootRaceTest,
    context,
    state,
    wrapperCalls,
    fallbackCalls,
    timers,
    setPullResult(value) { pullResult = value; },
    setRemoteEnabled(value) { remoteEnabled = Boolean(value); },
    setRemoteStoreReady(value) { remoteStoreReady = Boolean(value); }
  };
}

async function runDynamicContract() {
  const beforeBoot = createHarness({ marker: true });
  assert.strictEqual(await beforeBoot.api.reconcile(), false, 'Reconcile must wait while boot data is not ready');
  assert.strictEqual(beforeBoot.wrapperCalls.length, 0, 'Reconcile must not pull before boot is ready');
  assert.strictEqual(beforeBoot.api.getDone(), false, 'Waiting for boot must not consume the one-shot');

  const pendingTeam = createHarness({
    marker: true,
    state: { boot: { dataReady: true }, team: { mode: 'pending' } }
  });
  pendingTeam.context.__ALTEA_PRIMARY_INIT_FINISHED__ = true;
  assert.strictEqual(await pendingTeam.api.reconcile(), false, 'Reconcile must wait while the team store is pending');
  assert.strictEqual(pendingTeam.wrapperCalls.length, 0, 'Pending team state must not start another pull');
  assert.strictEqual(pendingTeam.api.getDone(), false, 'Pending team state must not consume the one-shot');

  const noRace = createHarness({
    marker: false,
    state: { boot: { dataReady: true }, team: { mode: 'ready' } }
  });
  noRace.context.__ALTEA_PRIMARY_INIT_FINISHED__ = true;
  assert.strictEqual(await noRace.api.reconcile(), true, 'No early team commit means reconciliation is already complete');
  assert.strictEqual(noRace.wrapperCalls.length, 0, 'No-race boot must not issue a redundant pull');
  assert.strictEqual(noRace.api.getDone(), true, 'No-race boot must consume the one-shot');

  const readyTeam = createHarness({
    marker: true,
    state: { boot: { dataReady: true }, team: { mode: 'ready' } }
  });
  readyTeam.context.__ALTEA_PRIMARY_INIT_FINISHED__ = true;
  assert.strictEqual(await readyTeam.api.reconcile(), true, 'Ready team state must reconcile successfully');
  assert.strictEqual(readyTeam.wrapperCalls.length, 1, 'Ready team state must call the public pull wrapper once');
  assert.strictEqual(readyTeam.fallbackCalls.length, 0, 'Public pull wrapper must win over the internal fallback');
  assert.strictEqual(readyTeam.wrapperCalls[0].args[0], true, 'Reconcile pull must request a rerender');
  assert.strictEqual(readyTeam.wrapperCalls[0].args[1]?.silent, true, 'Reconcile pull must be silent');
  assert.strictEqual(readyTeam.api.getDone(), true, 'Successful pull must consume the one-shot');
  assert.strictEqual(readyTeam.context.__ALTEA_TEAM_BOOT_RECONCILED__, true, 'Successful pull must publish the reconciled marker');
  assert.strictEqual(await readyTeam.api.reconcile(), true, 'Completed reconciliation must remain idempotent');
  assert.strictEqual(readyTeam.wrapperCalls.length, 1, 'Completed reconciliation must not pull twice');

  const nullResult = createHarness({
    marker: true,
    pullResult: null,
    state: { boot: { dataReady: true }, team: { mode: 'ready' } }
  });
  nullResult.context.__ALTEA_PRIMARY_INIT_FINISHED__ = true;
  assert.strictEqual(await nullResult.api.reconcile(), false, 'Null pull result must keep reconciliation pending');
  assert.strictEqual(nullResult.wrapperCalls.length, 1, 'Null result still represents one attempted pull');
  assert.strictEqual(nullResult.api.getDone(), false, 'Null pull result must not consume the one-shot');
  assert.strictEqual(nullResult.context.__ALTEA_TEAM_BOOT_RECONCILED__, undefined, 'Null pull result must not publish success');
  nullResult.setPullResult({ remoteEmpty: false, softErrors: [] });
  assert.strictEqual(await nullResult.api.reconcile(), true, 'A later non-null pull result must complete reconciliation');
  assert.strictEqual(nullResult.wrapperCalls.length, 2, 'Pending reconciliation must retry after a null result');
}

function runStaticSchedulerContract() {
  assert.match(source, /const POST_BOOT_RECONCILE_POLL_MS = 125;/, 'Scheduler poll must stay at 125 ms');
  assert.match(source, /const POST_BOOT_RECONCILE_MAX_ATTEMPTS = 240;/, 'Scheduler must retain its bounded 240-attempt limit');

  const schedulerStart = source.indexOf('function schedulePostBootTeamReconcileHotfix()');
  const schedulerEnd = source.indexOf('function bindAutoPullHotfix()', schedulerStart);
  const scheduler = source.slice(schedulerStart, schedulerEnd);
  assert.match(scheduler, /__ALTEA_TEAM_BOOT_RECONCILE_SCHEDULED__/, 'Scheduler must have a one-shot installation guard');
  assert.match(scheduler, /attempt >= POST_BOOT_RECONCILE_MAX_ATTEMPTS/, 'Scheduler must stop at the configured attempt limit');
  assert.match(scheduler, /run\(attempt \+ 1\)/, 'Scheduler must advance its bounded attempt counter');
  assert.match(scheduler, /POST_BOOT_RECONCILE_POLL_MS/, 'Scheduler retries must use the configured poll interval');

  const pullStart = source.indexOf('async function pullRemoteStateHotfix');
  const pullEnd = source.indexOf('async function initTeamStoreHotfix', pullStart);
  const pull = source.slice(pullStart, pullEnd);
  assert.match(
    pull,
    /if \(!remoteEmpty\) \{\s*if \(window\.__ALTEA_PRIMARY_INIT_FINISHED__ !== true\) \{\s*earlyTeamStorageCommitted = true;/,
    'Only a non-empty team pull completed before primary init may arm the reconciliation marker'
  );

  const installPull = source.indexOf("assignGlobal('pullRemoteState', pullRemoteStateHotfix)");
  const scheduleCall = source.indexOf('schedulePostBootTeamReconcileHotfix();', installPull);
  assert(installPull >= 0 && scheduleCall > installPull, 'Reconcile scheduler must start after the public pull function is installed');
}

runStaticSchedulerContract();
runDynamicContract()
  .then(() => console.log('portal-storage-boot-race.selftest: ok'))
  .catch((error) => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
