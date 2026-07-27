#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app-core-01.js'), 'utf8');

if (source.includes('LOCAL_FIRST_SNAPSHOT_KEYS')) {
  throw new Error('Core loader must check the published snapshot before accepting usable local JSON.');
}

function extractFunction(name) {
  const asyncStart = source.indexOf(`async function ${name}`);
  const start = asyncStart >= 0 ? asyncStart : source.indexOf(`function ${name}`);
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

async function verifySnapshotTransport() {
  const requests = [];
  const anonKey = 'public-anon-key';
  const transportSandbox = {
    URL,
    PORTAL_SNAPSHOT_TABLE: 'portal_data_snapshots',
    PORTAL_SNAPSHOT_REQUEST_TIMEOUT_MS: 30000,
    PORTAL_SNAPSHOT_KEY_BATCH_SIZE: 8,
    portalSnapshotState: { brand: '' },
    state: { team: { accessToken: 'guest-local-session' } },
    window: {
      __ALTEA_AUTH_SESSION__: { access_token: 'guest-local-session' },
      alteaPortalAuthGate: {
        getSession: () => ({ access_token: 'guest-local-session' })
      }
    },
    currentBrand: () => 'Алтея',
    currentConfig: () => ({
      brand: 'Алтея',
      supabase: {
        url: 'https://example.supabase.co',
        anonKey
      }
    }),
    withTimeout: async (promise) => promise,
    fetch: async (url, options) => {
      requests.push({ url: String(url), options });
      return {
        ok: true,
        json: async () => []
      };
    },
    result: null
  };

  vm.createContext(transportSandbox);
  vm.runInContext([
    extractFunction('getPortalSnapshotRequestConfig'),
    extractFunction('portalSnapshotRequestBaseUrl'),
    extractFunction('requestPortalSnapshotJson'),
    extractFunction('fetchPortalSnapshotRowsByKeys'),
    'result = {',
    '  fullConfig: getPortalSnapshotRequestConfig(),',
    '  baseConfig: portalSnapshotRequestBaseUrl(),',
    '  read: fetchPortalSnapshotRowsByKeys(Array.from({ length: 19 }, (_, index) => `key_${index + 1}`))',
    '};'
  ].join('\n'), transportSandbox);

  await transportSandbox.result.read;
  assert.strictEqual(
    transportSandbox.result.fullConfig.headers.Authorization,
    `Bearer ${anonKey}`,
    'Full snapshot read must not send the local guest placeholder as a Supabase bearer token.'
  );
  assert.strictEqual(
    transportSandbox.result.baseConfig.headers.Authorization,
    `Bearer ${anonKey}`,
    'Keyed snapshot read must use the stable public read credential.'
  );
  assert.strictEqual(requests.length, 3, 'Nineteen snapshot keys must be split into three safe requests.');
  assert.deepStrictEqual(
    requests.map(({ url }) => {
      const filter = new URL(url).searchParams.get('snapshot_key') || '';
      return filter === '' ? 0 : filter.replace(/^in\.\(|\)$/g, '').split(',').length;
    }),
    [8, 8, 3],
    'Snapshot key batches must never exceed the proven readback batch size of eight.'
  );
  assert.ok(
    requests.every(({ options }) => options.headers.Authorization === `Bearer ${anonKey}`),
    'Every keyed snapshot request must use the anon bearer token.'
  );
}

verifySnapshotTransport()
  .then(() => {
    console.log('portal-runtime-snapshot-choice selftest ok');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
