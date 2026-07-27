#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { hashPayload } = require('./portal-google-sheet-upload');

const ROOT = path.resolve(__dirname, '..');

function runUploader(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'portal-google-sheet-upload.js'), ...args], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'altea-atomic-snapshot-'));
  const postedRows = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const rows = JSON.parse(body || '[]');
      postedRows.push(...rows);
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end('{}');
    });
  });

  try {
    const alpha = {
      generatedAt: '2026-07-27T08:00:00.000Z',
      value: 'ц'.repeat(24000)
    };
    const beta = {
      generatedAt: '2026-07-27T08:00:01.000Z',
      rows: [{ articleKey: 'sku-1', price: 1000 }]
    };
    fs.writeFileSync(path.join(tempDir, 'alpha.json'), JSON.stringify(alpha));
    fs.writeFileSync(path.join(tempDir, 'beta.json'), JSON.stringify(beta));

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const result = await runUploader([
      '--input-dir', tempDir,
      '--snapshot', 'alpha,beta',
      '--commit-manifest', 'atomic_manifest',
      '--bundle-id', 'selftest-bundle-1',
      '--source', 'atomic-selftest',
      '--supabase-url', `http://127.0.0.1:${server.address().port}`,
      '--supabase-key', 'selftest-key'
    ]);
    assert.strictEqual(result.code, 0, result.stderr || result.stdout);
    assert(postedRows.length >= 4, 'large first snapshot must exercise chunked upload before the manifest');
    assert.strictEqual(postedRows.at(-1)?.snapshot_key, 'atomic_manifest', 'commit manifest must be the last published row');

    const manifest = postedRows.at(-1).payload;
    assert.strictEqual(manifest.schema, 'portal-snapshot-bundle-manifest-v1');
    assert.strictEqual(manifest.bundleId, 'selftest-bundle-1');
    assert.deepStrictEqual(manifest.requiredSnapshots, ['alpha', 'beta']);
    assert.strictEqual(manifest.snapshots.alpha.payloadHash, hashPayload(alpha));
    assert.strictEqual(manifest.snapshots.beta.payloadHash, hashPayload(beta));

    const alphaMeta = postedRows.find((row) => row.snapshot_key === 'alpha');
    const betaRow = postedRows.find((row) => row.snapshot_key === 'beta');
    assert.strictEqual(alphaMeta?.payload_hash, manifest.snapshots.alpha.payloadHash);
    assert.strictEqual(betaRow?.payload_hash, manifest.snapshots.beta.payloadHash);
    assert(
      postedRows.findIndex((row) => row.snapshot_key === 'beta')
        < postedRows.findIndex((row) => row.snapshot_key === 'atomic_manifest'),
      'every declared payload must complete before the commit manifest'
    );
    console.log('[portal-google-sheet-upload-atomic-bundle] PASS: chunked payloads complete before a hash-verified commit manifest');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
