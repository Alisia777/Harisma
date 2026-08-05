#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { ALLOWED_MIME_TYPES, BUCKET, FILE_SIZE_LIMIT, ensureDesignAttachmentStorage } = require('./setup-design-attachment-storage');

async function runScenario(existingStatus) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body || '' });
    if (calls.length === 1) return new Response('{}', { status: existingStatus });
    return new Response('{}', { status: 200 });
  };
  const result = await ensureDesignAttachmentStorage(fetchImpl, { baseUrl: 'https://supabase.test', serviceRoleKey: 'service-key' });
  return { calls, result };
}

(async () => {
  const updated = await runScenario(200);
  assert.strictEqual(updated.calls[1].method, 'PUT');
  const updatePayload = JSON.parse(updated.calls[1].body);
  assert.strictEqual(updatePayload.id, BUCKET);
  assert.strictEqual(updatePayload.public, false);
  assert.strictEqual(updated.result.public, false);
  assert.strictEqual(updatePayload.file_size_limit, FILE_SIZE_LIMIT);
  assert.ok(updatePayload.allowed_mime_types.includes('image/png'));
  assert.ok(updatePayload.allowed_mime_types.includes('application/pdf'));
  assert.ok(updatePayload.allowed_mime_types.includes('image/vnd.adobe.photoshop'));
  assert.deepStrictEqual(updatePayload.allowed_mime_types, ALLOWED_MIME_TYPES);

  const created = await runScenario(404);
  assert.strictEqual(created.calls[1].method, 'POST');
  assert.match(created.calls[1].url, /\/storage\/v1\/bucket$/);
  assert.strictEqual(created.result.created, true);
  assert.strictEqual(created.result.public, false);
  console.log('setup-design-attachment-storage.selftest: ok');
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
