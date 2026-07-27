#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'portal-team-runtime-hotfix.js'), 'utf8');
const appCoreSource = fs.readFileSync(path.join(root, 'app-core-03.js'), 'utf8');
const securityAuditSource = fs.readFileSync(path.join(root, 'portal-security-audit.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const liveIndex = fs.readFileSync(path.join(root, 'live-index.html'), 'utf8');
const start = source.indexOf('async function initTeamStoreHotfix()');
const end = source.indexOf('const AUTO_PULL_INTERVAL_MS', start);

assert(start >= 0 && end > start, 'initTeamStoreHotfix must exist');
assert(index.includes('portal-team-runtime-hotfix.js?v=20260727snapshotretry1'), 'Protected entrypoint must load the authenticated team runtime');
assert(liveIndex.includes('portal-team-runtime-hotfix.js?v=20260727snapshotretry1'), 'Live entrypoint must load the authenticated team runtime');
assert(index.includes('portal-security-audit.js?v=20260727snapshotretry1'), 'Protected entrypoint must load guest-safe audit routing');
assert(
  appCoreSource.includes('isLocalGuestPortalSessionToken')
    && appCoreSource.includes("state.team.note = 'Гостевой режим · локальные задачи'"),
  'Core team runtime must keep the local guest marker out of Supabase reads.'
);
assert(
  securityAuditSource.includes('guest-local-session')
    && securityAuditSource.includes('token = token || cfg.supabaseKey;'),
  'Security audit must fall back to the public key for a local guest session.'
);
assert(
  source.includes('const softErrors = [];')
    && source.includes('Задачи синхронизированы'),
  'Optional team data must not mark successfully loaded tasks as partially connected'
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
    localGuestSessionToken: (token) => /^guest-local-session(?:$|[-:])/i.test(String(token || '').trim()),
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

  const localGuest = createHarness({
    session: {
      access_token: 'guest-local-session',
      user: { id: 'guest-local', email: 'guest@qeep.life', user_metadata: {} }
    },
    auth: 'email_password'
  });
  await localGuest.api.init();
  assert.strictEqual(localGuest.state.team.accessToken, '', 'Local guest marker must not become a Supabase bearer token.');
  assert.strictEqual(localGuest.state.team.mode, 'local', 'Local guest must keep team data in local mode.');
  assert.strictEqual(localGuest.calls.anonymous, 0, 'Local guest must not retry anonymous Supabase auth.');
  assert.strictEqual(localGuest.calls.pulls, 0, 'Local guest must not issue remote team queries.');

  console.log('portal-team-auth-session.selftest: ok');
}

run().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
