#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'portal-snapshot-transport.js'), 'utf8');

async function main() {
  const networkCalls = [];
  let firstRequestFailed = false;
  const sandbox = {
    URL,
    Date,
    Promise,
    Object,
    console,
    AbortController: undefined,
    window: {
      setTimeout(callback) {
        callback();
        return 1;
      },
      clearTimeout() {}
    },
    fetch: async (url) => {
      networkCalls.push(String(url));
      if (!firstRequestFailed && String(url).includes('snapshot_key=eq.a')) {
        firstRequestFailed = true;
        return {
          ok: false,
          status: 500,
          text: async () => 'temporary database overload'
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => [{ url: String(url) }]
      };
    }
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  const transport = sandbox.window.__ALTEA_PORTAL_SNAPSHOT_TRANSPORT_V1__;
  assert.ok(transport?.requestJson, 'Snapshot transport must expose requestJson.');

  const urlA = 'https://example.supabase.co/rest/v1/portal_data_snapshots?order=generated_at.desc&snapshot_key=eq.a';
  const equivalentUrlA = 'https://example.supabase.co/rest/v1/portal_data_snapshots?snapshot_key=eq.a';
  const urlB = 'https://example.supabase.co/rest/v1/portal_data_snapshots?snapshot_key=eq.b';
  const [first, coalesced, second] = await Promise.all([
    transport.requestJson(urlA),
    transport.requestJson(equivalentUrlA),
    transport.requestJson(urlB)
  ]);

  assert.deepStrictEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(coalesced)));
  assert.strictEqual(second.length, 1);
  assert.strictEqual(networkCalls.length, 3, 'One retry plus one queued request is expected.');
  assert.strictEqual(
    transport.diagnostics().maxObservedConcurrency,
    2,
    'Snapshot reads must stay within the two-request concurrency ceiling.'
  );
  assert.strictEqual(transport.diagnostics().retries, 1, 'HTTP 500 must be retried.');

  await transport.requestJson(equivalentUrlA);
  assert.strictEqual(networkCalls.length, 3, 'Equivalent successful reads must use the short-lived cache.');

  transport.invalidate();
  await transport.requestJson(equivalentUrlA);
  assert.strictEqual(networkCalls.length, 4, 'Invalidation must force a new network read.');

  console.log('portal-snapshot-transport selftest ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
