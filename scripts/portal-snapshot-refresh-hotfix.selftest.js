#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'portal-snapshot-refresh-hotfix.js'), 'utf8');
const supabaseSource = fs.readFileSync(path.join(root, 'portal-supabase-snapshot-hotfix.js'), 'utf8');

function extractAsyncFunction(name) {
  const start = source.indexOf(`async function ${name}`);
  if (start < 0) throw new Error(`Missing async function ${name}`);
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
  throw new Error(`Unclosed async function ${name}`);
}

if (source.includes('LOCAL_FIRST_KEYS')) {
  throw new Error('Snapshot-aware loader must not return usable local JSON before checking the published snapshot.');
}

const remotePayload = { latestMarketplaceDate: '2026-07-20', source: 'snapshot' };
const localPayload = { latestMarketplaceDate: '2026-07-16', source: 'local' };
const calls = [];
const sandbox = {
  snapshotKeyFromPath: () => 'platform_trends',
  fetchSnapshotRows: async () => ({ platform_trends: remotePayload }),
  payloadLooksUsable: (_key, payload) => Boolean(payload),
  clone: (payload) => JSON.parse(JSON.stringify(payload)),
  fetchLocalJson: async () => localPayload,
  chooseFreshestPayload: (key, snapshot, local) => {
    calls.push({ key, snapshot, local });
    return snapshot.latestMarketplaceDate >= local.latestMarketplaceDate ? snapshot : local;
  },
  originalLoadSnapshot: null,
  console,
  result: null
};

async function main() {
  vm.createContext(sandbox);
  vm.runInContext(`${extractAsyncFunction('loadSnapshotAwareJson')}
result = loadSnapshotAwareJson('data/platform_trends.json', null, false);`, sandbox);

  const result = await sandbox.result;
  if (calls.length !== 1) {
    throw new Error(`Expected one freshness comparison, received ${calls.length}.`);
  }
  if (calls[0].snapshot.latestMarketplaceDate !== '2026-07-20') {
    throw new Error('Published snapshot was not passed to the freshness comparison.');
  }
  if (calls[0].local.latestMarketplaceDate !== '2026-07-16') {
    throw new Error('Local fallback was not passed to the freshness comparison.');
  }
  if (result.source !== 'snapshot') {
    throw new Error('Newer published snapshot must win over stale local JSON.');
  }

  const requestFilters = [];
  const batchSandbox = {
    URL,
    buildSnapshotUrl: () => new URL('https://example.supabase.co/rest/v1/portal_data_snapshots'),
    requestSnapshotRows: async (url) => {
      requestFilters.push(url.searchParams.get('snapshot_key') || '');
      return [];
    },
    result: null
  };
  vm.createContext(batchSandbox);
  vm.runInContext(`${extractAsyncFunction('requestRowsForExactKeys')}
result = requestRowsForExactKeys({}, '', 'Алтея', Array.from({ length: 19 }, (_, index) => 'part_' + (index + 1)));`, batchSandbox);
  await batchSandbox.result;
  const batchLengths = requestFilters.map((filter) => (
    filter.replace(/^in\.\(|\)$/g, '').replace(/^eq\./, '').split(',').filter(Boolean).length
  ));
  if (JSON.stringify(batchLengths) !== JSON.stringify([8, 8, 3])) {
    throw new Error(`Snapshot refresh must use safe batches of eight, received ${JSON.stringify(batchLengths)}.`);
  }
  if (!supabaseSource.includes('const batchSize = 8;')) {
    throw new Error('Live Supabase refresh must use the same safe eight-key batch size.');
  }
  if (source.includes('index += 40') || supabaseSource.includes('index += 40')) {
    throw new Error('Legacy forty-key snapshot queries must not remain in active refresh loaders.');
  }

  console.log('portal-snapshot-refresh-hotfix selftest ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
