const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function extractFunction(source, name) {
  const functionStart = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(functionStart, -1, `Missing function ${name}`);
  const start = source.slice(functionStart - 6, functionStart) === 'async '
    ? functionStart - 6
    : functionStart;
  const paramsStart = source.indexOf('(', functionStart);
  let paramsEnd = -1;
  let paramsDepth = 0;
  for (let index = paramsStart; index < source.length; index += 1) {
    if (source[index] === '(') paramsDepth += 1;
    if (source[index] === ')') {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        paramsEnd = index;
        break;
      }
    }
  }
  const bodyStart = source.indexOf('{', paramsEnd);
  assert.notStrictEqual(bodyStart, -1, `Missing body for ${name}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

function testStrategicTaskPersistence() {
  const source = read('app-core-02.js');
  const context = vm.createContext({
    normalizeTask(task, sourceHint) {
      return { ...task, source: task.source || sourceHint };
    },
    isSuppressedAutoStockTask: () => false,
    isNonPersistentTaskSource: () => false
  });
  vm.runInContext([
    extractFunction(source, 'isAutoTaskLike'),
    extractFunction(source, 'isPersistentAutoTask'),
    extractFunction(source, 'normalizeStorageTasks'),
    'this.normalizeStorageTasksForTest = normalizeStorageTasks;'
  ].join('\n'), context);

  const normalized = context.normalizeStorageTasksForTest([
    { id: 'strategic-1', source: 'strategic', autoCode: ' ROP_STRATEGIC ' },
    { id: 'oos-1', source: 'auto', autoCode: 'oos_control' },
    { id: 'manual-1', source: 'manual' },
    { id: 'transient-1', source: 'auto', autoCode: 'transient_signal' }
  ]);
  const keptIds = JSON.parse(JSON.stringify(normalized)).map((task) => task.id);
  assert.deepStrictEqual(keptIds, ['strategic-1', 'oos-1', 'manual-1']);
}

async function testAutoPullUsesInstalledWrapper() {
  const source = read('portal-team-runtime-hotfix.js');
  const calls = [];
  const runtimeWindow = {};
  runtimeWindow.pullRemoteState = async function wrappedPull(...args) {
    calls.push({ kind: 'wrapper', args });
  };

  const context = vm.createContext({
    window: runtimeWindow,
    document: { getElementById: () => null },
    console,
    appState: () => ({ activeView: 'control', team: { mode: 'ready' } }),
    canUseRemote: () => true,
    hasRemoteStoreHotfix: () => true,
    async pullRemoteStateHotfix(...args) {
      calls.push({ kind: 'direct', args });
    },
    async maybeAutoRefreshSnapshotsHotfix(reason) {
      calls.push({ kind: 'snapshot', reason });
    }
  });
  vm.runInContext([
    'let autoPullInFlight = false;',
    extractFunction(source, 'autoPullRemoteStateHotfix'),
    'this.autoPullRemoteStateForTest = autoPullRemoteStateHotfix;'
  ].join('\n'), context);

  await context.autoPullRemoteStateForTest('interval');
  let normalizedCalls = JSON.parse(JSON.stringify(calls));
  assert.deepStrictEqual(normalizedCalls, [
    { kind: 'wrapper', args: [false, { silent: true }] },
    { kind: 'snapshot', reason: 'interval' }
  ]);

  calls.length = 0;
  delete runtimeWindow.pullRemoteState;
  await context.autoPullRemoteStateForTest('focus');
  normalizedCalls = JSON.parse(JSON.stringify(calls));
  assert.deepStrictEqual(normalizedCalls, [
    { kind: 'direct', args: [false, { silent: false }] },
    { kind: 'snapshot', reason: 'focus' }
  ]);
}

async function main() {
  testStrategicTaskPersistence();
  await testAutoPullUsesInstalledWrapper();
  console.log('portal strategic task persistence selftest: OK');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
