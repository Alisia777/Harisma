#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const designers = fs.readFileSync(path.join(root, 'portal-designers.js'), 'utf8');
const authGate = fs.readFileSync(path.join(root, 'portal-auth-gate.js'), 'utf8');
const access = fs.readFileSync(path.join(root, 'portal-auth-access.js'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'docs', 'supabase_design_workspace_setup.sql'), 'utf8');

new vm.Script(designers, { filename: 'portal-designers.js' });
new vm.Script(authGate, { filename: 'portal-auth-gate.js' });
new vm.Script(access, { filename: 'portal-auth-access.js' });

assert.match(designers, /function fetchMembership\(\)/, 'Client must load workspace membership');
assert.match(designers, /level === 'viewer'/, 'Viewer membership must be recognized');
assert.match(designers, /function canEdit\(\).*workspaceAccess === 'editor'.*workspaceAccess === 'local'/s, 'Only editors and explicit local mode may mutate');
assert.match(designers, /data-design-readonly=/, 'Workspace must publish read-only state to the DOM');
assert.match(designers, /form input, form select, form textarea, \[data-design-status\]/, 'Viewer forms and inline status controls must be disabled');
assert.match(designers, /function scopedStorageKey\(\)/, 'Local storage must be scoped per signed-in user');
assert.match(designers, /function purgeScopedLocalData\(\)/, 'Revoked users must have their scoped cache purged');
assert.match(designers, /workspaceAccess === 'none'[\s\S]*purgeScopedLocalData\(\)/, 'A missing membership must trigger cache removal');
assert.match(designers, /\['history', 'История'\]/, 'History must be a first-class workspace tab');
assert.match(designers, /function restoreLocalBackup\(key\)/, 'Local backup restoration must exist');
assert.match(designers, /restore_portal_design_workspace_revision/, 'Remote revision restoration must use the protected RPC');
assert.match(designers, /window\.confirm\('Восстановить командную версию/, 'Remote restore must require an explicit confirmation');

assert.match(access, /guest: \{[\s\S]*views: EMPLOYEE_VIEWS/, 'Guest role must use an explicit non-owner view set');
assert.match(access, /'guest@qeep\.life': \{ role: 'guest'/, 'Guest account must not inherit owner access');
assert.doesNotMatch(authGate, /portal_role: 'owner'/, 'Synthetic guest sessions must never claim owner role');
assert.match(authGate, /portal_role: 'guest'/, 'Synthetic guest sessions must claim only the restricted guest role');

for (const table of [
  'portal_design_workspace_members',
  'portal_design_workspaces',
  'portal_design_workspace_history',
  'portal_design_workspace_audit'
]) {
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'), `${table} must have RLS enabled`);
  assert.match(sql, new RegExp(`revoke all on public\\.${table} from anon, authenticated`, 'i'), `${table} must default to no privileges`);
}

assert.match(sql, /member\.access_level = 'editor'/, 'Server writes must require editor membership');
assert.match(sql, /revision_conflict/, 'Writes must use optimistic revision checks');
assert.match(sql, /pg_advisory_xact_lock/, 'Creation and updates must be serialized per workspace');
assert.match(sql, /octet_length\(p_payload::text\) > 26214400/, 'Server must cap oversized payloads');
assert.match(sql, /insert into public\.portal_design_workspace_history/gi, 'Each server save must produce history');
assert.match(sql, /insert into public\.portal_design_workspace_audit/gi, 'Each server save or restore must produce an audit event');
assert.match(sql, /create or replace function public\.restore_portal_design_workspace_revision/, 'Protected remote restore RPC must exist');
assert.match(sql, /grant execute on function public\.restore_portal_design_workspace_revision[^;]+to authenticated/i, 'Authenticated members must be able to invoke the restore RPC');

console.log('portal-designers-access-history.selftest: ok');
