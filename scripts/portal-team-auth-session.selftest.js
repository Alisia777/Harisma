#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'portal-team-runtime-hotfix.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const liveIndex = fs.readFileSync(path.join(root, 'live-index.html'), 'utf8');
const start = source.indexOf('async function initTeamStoreHotfix()');
const end = source.indexOf('const AUTO_PULL_INTERVAL_MS', start);

assert(start >= 0 && end > start, 'initTeamStoreHotfix must exist');
assert(index.includes('portal-team-runtime-hotfix.js?v=20260724taskvisibility2'), 'Protected entrypoint must load the authenticated team runtime');
assert(liveIndex.includes('portal-team-runtime-hotfix.js?v=20260724taskvisibility2'), 'Live entrypoint must load the authenticated team runtime');
assert(
  source.includes('const softErrors = [commentResult, decisionResult, ownerResult]'),
  'Optional repricer controls must not mark the task database as partially connected'
);

const testableSource = `
  ${source.slice(start, end)}
  window.__teamAuthTest = { init: initTeamStoreHotfix };
`;

function createHarness({ session = null, auth = 'email_password' } = {}) {
  const state = {
    team: {
      member: { name: '', role: 'Команда' },
      accessToken: '',
      userId: '',
      client: null,
      ready: false,
      mode: 'local',
      error: '',
      note: ''
    }
  };
  const calls = { anonymous: 0, pulls: 0 };
  const context = {
    console: { log() {}, warn() {}, error() {} },
    hydratePortalStorageBeforeRemoteHotfix() {},
    appState: () => state,
    config: () => ({
      teamMode: 'supabase',
      teamMember: { name: '', role: 'Команда' },
      supabase: { url: 'https://example.supabase.co', anonKey: 'public-key', auth }
    }),
    canUseRemote: () => true,
    DEFAULT_APP_CONFIG: { teamMember: { name: '', role: 'Команда' } },
    updateSyncBadge() {},
    applyOwnerOverridesToSkus() {},
    signInAnonymouslyHotfix: async () => {
      calls.anonymous += 1;
      return { access_token: 'anonymous-token', user: { id: 'anonymous-user' } };
    },
    pullRemoteStateHotfix: async () => {
      calls.pulls += 1;
      return { remoteEmpty: false, softErrors: [] };
    }
  };
  context.window = context;
  context.window.__ALTEA_AUTH_SESSION__ = session;
  context.window.__ALTEA_PORTAL_ACCESS__ = session
    ? { name: 'Мария Пехова' }
    : null;
  vm.createContext(context);
  vm.runInContext(testableSource, context, { filename: 'portal-team-auth-session.vm.js' });
  return { state, calls, api: context.window.__teamAuthTest };
}

async function run() {
  const authenticated = createHarness({
    session: {
      access_token: 'employee-token',
      user: {
        id: 'employee-id',
        email: 'm.v.pekhova@qeep.life',
        user_metadata: {}
      }
    },
    auth: 'anonymous'
  });
  await authenticated.api.init();
  assert.strictEqual(authenticated.state.team.accessToken, 'employee-token', 'Existing employee token must win over anonymous mode');
  assert.strictEqual(authenticated.state.team.userId, 'employee-id', 'Employee user id must be retained');
  assert.strictEqual(authenticated.state.team.member.name, 'Мария Пехова', 'Portal access name must become the team actor');
  assert.strictEqual(authenticated.calls.anonymous, 0, 'Authenticated employees must not create an anonymous session');
  assert.strictEqual(authenticated.calls.pulls, 1, 'Authenticated initialization must pull team data');
  assert.strictEqual(authenticated.state.team.mode, 'ready', 'Authenticated team store must become ready');

  const anonymous = createHarness({ session: null, auth: 'anonymous' });
  await anonymous.api.init();
  assert.strictEqual(anonymous.state.team.accessToken, 'anonymous-token', 'Anonymous deployments must retain their fallback');
  assert.strictEqual(anonymous.calls.anonymous, 1, 'Anonymous fallback must sign in once');

  const missing = createHarness({ session: null, auth: 'email_password' });
  await missing.api.init();
  assert.strictEqual(missing.state.team.mode, 'error', 'Protected deployments without a session must fail closed');
  assert.match(missing.state.team.error, /auth session is missing/, 'Missing protected session must expose the real cause');

  console.log('portal-team-auth-session.selftest: ok');
}

run().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
