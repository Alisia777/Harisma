#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app-core-01.js'), 'utf8');

if (source.includes('LOCAL_FIRST_SNAPSHOT_KEYS')) {
  throw new Error('Core loader must check the published snapshot before accepting usable local JSON.');
}

function extractFunction(name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unclosed function ${name}`);
}

const helperBlock = [
  extractFunction('protectedSnapshotKey'),
  extractFunction('preferPublishedSnapshotOnTie'),
  extractFunction('chooseFreshestPayload')
].join('\n');

const forbidden = [
  ['iu', 'drr'].join('_'),
  ['iu', 'drr'].join('-'),
  `iu${'Drr'}`
];
for (const token of forbidden) {
  if (helperBlock.includes(token)) {
    throw new Error(`Snapshot tie helper must not hard-code protected token ${token}`);
  }
}

const sandbox = {
  snapshotPayloadLooksUsable: (_key, payload) => Boolean(payload && payload.usable),
  shouldPreferLocalAliasCoverage: () => false,
  payloadDataFreshnessScore: (_key, payload) => Number(payload.dataScore || 0),
  payloadFreshnessScore: (_key, payload) => Number(payload.freshScore || 0),
  result: null
};

vm.createContext(sandbox);
vm.runInContext(`${helperBlock}
result = {
  nonProtectedTie: chooseFreshestPayload('platform_trends', { usable: true, dataScore: 1, freshScore: 2 }, { usable: true, dataScore: 1, freshScore: 2 }).source,
  snapshotNewer: chooseFreshestPayload('platform_trends', { usable: true, dataScore: 2, freshScore: 2 }, { usable: true, dataScore: 1, freshScore: 2 }).source,
  localNewer: chooseFreshestPayload('platform_trends', { usable: true, dataScore: 1, freshScore: 2 }, { usable: true, dataScore: 2, freshScore: 2 }).source,
  protectedTie: chooseFreshestPayload(['iu', 'drr', 'summary'].join('_'), { usable: true, dataScore: 1, freshScore: 2 }, { usable: true, dataScore: 1, freshScore: 2 }).source
};`, sandbox);

if (sandbox.result.nonProtectedTie !== 'snapshot') {
  throw new Error('Published non-protected snapshot must win freshness ties.');
}
if (sandbox.result.snapshotNewer !== 'snapshot') {
  throw new Error('Published snapshot with newer data date must win.');
}
if (sandbox.result.localNewer !== 'local') {
  throw new Error('Local payload with newer data date must still win.');
}
if (sandbox.result.protectedTie !== 'local') {
  throw new Error('Protected summary tie behavior must stay local-first.');
}

console.log('portal-runtime-snapshot-choice selftest ok');
