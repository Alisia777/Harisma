#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  configFromEnv,
  desiredAccess,
  isPortalAccount,
  syncMemberships
} = require('./sync-design-workspace-memberships');

const config = {
  supabaseUrl: 'https://supabase.test',
  serviceRoleKey: 'service-role-test-key',
  brand: 'Алтея'
};
const users = [
  { id: 'owner-managed', email: 'owner@qeep.life', app_metadata: { portal_role: 'owner' } },
  { id: 'manual-employee', email: 'manual@qeep.life', app_metadata: {} },
  { id: 'new-designer', email: 'designer@qeep.life', app_metadata: { portal_role: 'designer' } },
  { id: 'readonly-unchanged', email: 'readonly@qeep.life', app_metadata: {} },
  { id: 'new-employee', email: 'employee@qeep.life', app_metadata: {} },
  { id: 'consumer-user', email: 'consumer@example.com', app_metadata: {} }
];
const memberships = [
  { brand: 'Алтея', user_id: 'owner-managed', access_level: 'viewer', managed_by_role: true },
  { brand: 'Алтея', user_id: 'manual-employee', access_level: 'editor', managed_by_role: false },
  { brand: 'Алтея', user_id: 'readonly-unchanged', access_level: 'viewer', managed_by_role: true },
  { brand: 'Алтея', user_id: 'consumer-user', access_level: 'viewer', managed_by_role: true }
];
const upserted = [];
const deleted = [];
const portalAccess = {
  emails: new Set(['manual@qeep.life', 'readonly@qeep.life', 'employee@qeep.life']),
  roles: new Set(['owner', 'designer', 'employee', 'readonly'])
};

async function mockFetch(input, options = {}) {
  const url = new URL(String(input));
  assert.strictEqual(options.headers.Authorization, 'Bearer service-role-test-key');
  assert.strictEqual(options.headers.apikey, 'service-role-test-key');
  if (url.pathname === '/auth/v1/admin/users') {
    const page = Number(url.searchParams.get('page'));
    const perPage = Number(url.searchParams.get('per_page'));
    const start = (page - 1) * perPage;
    return new Response(JSON.stringify({ users: users.slice(start, start + perPage) }), { status: 200 });
  }
  if (url.pathname === '/rest/v1/portal_design_workspace_members' && !options.method) {
    assert.strictEqual(url.searchParams.get('brand'), 'eq.Алтея');
    const [start, end] = options.headers.Range.split('-').map(Number);
    return new Response(JSON.stringify(memberships.slice(start, end + 1)), { status: 200 });
  }
  if (url.pathname === '/rest/v1/portal_design_workspace_members' && options.method === 'POST') {
    assert.strictEqual(url.searchParams.get('on_conflict'), 'brand,user_id');
    assert.match(options.headers.Prefer, /resolution=merge-duplicates/);
    upserted.push(...JSON.parse(options.body));
    return new Response(null, { status: 204 });
  }
  if (url.pathname === '/rest/v1/portal_design_workspace_members' && options.method === 'DELETE') {
    assert.strictEqual(url.searchParams.get('managed_by_role'), 'eq.true');
    deleted.push(...url.searchParams.get('user_id').replace(/^in\.\(|\)$/g, '').split(','));
    return new Response(null, { status: 204 });
  }
  return new Response('not found', { status: 404 });
}

async function run() {
  const workflow = fs.readFileSync(path.resolve(__dirname, '..', '.github', 'workflows', 'portal-designers-membership-sync.yml'), 'utf8');
  assert.match(workflow, /secrets\.SUPABASE_SERVICE_ROLE_KEY/, 'Workflow must use the protected service-role secret');
  assert.match(workflow, /secrets\.ALTEA_SUPABASE_SERVICE_ROLE_KEY/, 'Workflow must accept the existing service-role secret alias');
  assert.match(workflow, /schedule:/, 'New accounts must be synchronized automatically after deployment');
  assert.throws(() => configFromEnv({ SUPABASE_URL: 'https://supabase.test' }), /SERVICE_ROLE_KEY/);
  assert.strictEqual(desiredAccess({ app_metadata: { portal_role: 'owner' } }), 'editor');
  assert.strictEqual(desiredAccess({ app_metadata: { portal_role: 'designer' } }), 'editor');
  assert.strictEqual(desiredAccess({ app_metadata: { portal_role: 'employee' } }), 'viewer');
  assert.strictEqual(desiredAccess({ app_metadata: {} }), 'viewer');
  assert.strictEqual(isPortalAccount(users[0], portalAccess), true, 'Protected portal roles must be included');
  assert.strictEqual(isPortalAccount(users[1], portalAccess), true, 'Portal allowlist emails must be included');
  assert.strictEqual(isPortalAccount(users[5], portalAccess), false, 'Unconfigured Supabase accounts must stay outside the workspace');

  const summary = await syncMemberships({
    fetchImpl: mockFetch,
    config,
    portalAccess,
    pageSize: 2,
    membershipPageSize: 2,
    batchSize: 2,
    now: '2026-07-21T20:00:00.000Z'
  });

  assert.deepStrictEqual(summary, {
    brand: 'Алтея',
    users: 6,
    portalUsers: 5,
    created: 2,
    updated: 1,
    unchanged: 1,
    manualPreserved: 1,
    removed: 1,
    upserted: 3
  });
  assert.deepStrictEqual(upserted.map((row) => [row.user_id, row.access_level]), [
    ['owner-managed', 'editor'],
    ['new-designer', 'editor'],
    ['new-employee', 'viewer']
  ]);
  assert.ok(upserted.every((row) => row.managed_by_role === true));
  assert.ok(!upserted.some((row) => row.user_id === 'manual-employee'), 'Manual membership must not be overwritten');
  assert.deepStrictEqual(deleted, ['consumer-user'], 'Only stale automatically managed memberships may be removed');
  console.log('sync-design-workspace-memberships.selftest: ok');
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
