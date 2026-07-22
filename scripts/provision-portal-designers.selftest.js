#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { configFromEnv, provisionAccounts } = require('./provision-portal-designers');

async function run() {
  assert.throws(() => configFromEnv({ SUPABASE_URL: 'https://supabase.test' }), /SERVICE_ROLE_KEY/);
  const source = { accounts: [
    { email: 'existing@qeep.life', name: 'Existing', role: 'designer' },
    { email: 'new@qeep.life', name: 'New', role: 'designer' }
  ] };
  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(String(input));
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, method: options.method || 'GET', body });
    assert.strictEqual(options.headers.apikey, 'secret');
    assert.strictEqual(options.headers.Authorization, 'Bearer secret');
    if (url.pathname === '/auth/v1/admin/users' && !options.method) {
      return new Response(JSON.stringify({ users: [{ id: 'existing-id', email: 'existing@qeep.life', app_metadata: { provider: 'email' }, user_metadata: {} }] }), { status: 200 });
    }
    if (url.pathname === '/auth/v1/invite') {
      return new Response(JSON.stringify({ id: 'new-id', email: 'new@qeep.life', app_metadata: {}, user_metadata: {} }), { status: 200 });
    }
    if (url.pathname === '/auth/v1/recover') return new Response('{}', { status: 200 });
    if (url.pathname.startsWith('/auth/v1/admin/users/')) return new Response(JSON.stringify({ user: { id: url.pathname.split('/').pop() } }), { status: 200 });
    return new Response('not found', { status: 404 });
  };
  const summary = await provisionAccounts({
    fetchImpl,
    config: { supabaseUrl: 'https://supabase.test', serviceRoleKey: 'secret', redirectUrl: 'https://харизмой.рф/' },
    source
  });
  assert.deepStrictEqual(summary, { requested: 2, invited: 1, passwordSetupSent: 1, metadataUpdated: 2 });
  assert.strictEqual(calls.filter((call) => call.url.pathname === '/auth/v1/invite').length, 1);
  assert.strictEqual(calls.filter((call) => call.url.pathname === '/auth/v1/recover').length, 1);
  const updates = calls.filter((call) => call.method === 'PUT');
  assert.strictEqual(updates.length, 2);
  assert.ok(updates.every((call) => call.body.app_metadata.portal_role === 'designer'));
  assert.ok(updates.every((call) => !Object.prototype.hasOwnProperty.call(call.body, 'password')), 'Passwords must never be generated or logged by the workflow');
  console.log('provision-portal-designers.selftest: ok');
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
