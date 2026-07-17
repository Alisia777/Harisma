const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app-core-02.js'), 'utf8');
const LABELS = {
  ym: '\u042f\u041c',
  goldapple: '\u0417\u042f',
  magnit: '\u041c\u0430\u0433\u043d\u0438\u0442',
  letu: '\u041b\u044d\u0442\u0443\u0430\u043b\u044c'
};

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `Missing function ${name}`);
  const paramsEnd = source.indexOf(')', start);
  const bodyStart = source.indexOf('{', paramsEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

function marketplaceFromLabel(text) {
  const value = String(text || '').toLowerCase();
  if (value.includes(LABELS.ym.toLowerCase())) return 'ya';
  if (value.includes(LABELS.goldapple.toLowerCase())) return 'goldapple';
  if (value.includes(LABELS.magnit.toLowerCase())) return 'magnit';
  if (value.includes(LABELS.letu.toLowerCase())) return 'letu';
  return '';
}

const context = vm.createContext({
  detectCorrectedGoldappleTaskPlatform: () => '',
  taskMarketplaceContext: (task) => task.entityLabel || '',
  normalizeTaskPlatform: (value) => String(value || '').trim().toLowerCase(),
  detectMarketplaceNetworkKey: marketplaceFromLabel
});
vm.runInContext([
  extractFunction('detectTaskPlatform'),
  'this.detectTaskPlatformForTest = detectTaskPlatform;'
].join('\n'), context);

for (const entityLabel of Object.values(LABELS)) {
  assert.strictEqual(
    context.detectTaskPlatformForTest({
      source: 'strategic',
      autoCode: 'rop_strategic',
      platform: 'cross',
      entityLabel
    }),
    'cross',
    `Strategic cross task was reclassified by label: ${entityLabel}`
  );
}

assert.strictEqual(
  context.detectTaskPlatformForTest({
    source: 'manual', autoCode: ' ROP_STRATEGIC ', platform: 'cross', entityLabel: LABELS.magnit
  }),
  'cross'
);
assert.strictEqual(
  context.detectTaskPlatformForTest({ source: 'manual', platform: 'cross', entityLabel: LABELS.magnit }),
  'magnit'
);

console.log('portal strategic cross-platform selftest: OK');
