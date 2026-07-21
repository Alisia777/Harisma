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
const appCore10 = fs.readFileSync(path.join(root, 'app-core-10.js'), 'utf8');
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
assert.match(designers, /function threeWayMergeData\(base, remote, local\)/, 'Concurrent edits must use a three-way merge');
assert.match(designers, /lastSyncedData: lastSyncedData/, 'The common sync ancestor must survive reloads and offline edits');
assert.match(designers, /data-design-conflict-remote/, 'Concurrency conflicts must require an explicit user choice');
assert.match(designers, /function fetchRemoteAudit\(\)/, 'The UI must fetch a server-backed audit trail');
assert.match(designers, /actor_id,actor_email/, 'Server audit rows must include a durable actor identity');
assert.match(designers, /<h3>Серверный аудит<\/h3>/, 'Server audit must be distinct from local activity');
assert.match(designers, /if \(!hasLocalChanges[\s\S]*fetchRemote\(\)/, 'Manual refresh must inspect remote state before writing');
assert.doesNotMatch(appCore10, /view-designers/, 'Protected app-core-10 must not be modified to render Designers');

const helperStart = designers.indexOf('  function legacyHashText');
const helperEnd = designers.indexOf('  function mergeEntities', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'Hash helpers must be extractable for collision regression testing');
const hashSandbox = {};
vm.runInNewContext(`${designers.slice(helperStart, helperEnd)}\nresult = { legacy: legacyHashText, strong: hashText };`, hashSandbox);
const collisionA = 'project-9-913-1o6ezdt-15e3f64';
const collisionB = 'project-9-10919-1y7qr4d-yexhoo';
assert.strictEqual(hashSandbox.result.legacy(collisionA), hashSandbox.result.legacy(collisionB), 'Regression fixture must collide under the legacy 32-bit hash');
assert.notStrictEqual(hashSandbox.result.strong(collisionA), hashSandbox.result.strong(collisionB), 'Imported rows must not collapse under a legacy 32-bit collision');
assert.strictEqual(hashSandbox.result.strong(collisionA).length, 32, 'New local/import identifiers must use a 128-bit digest');

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
assert.match(sql, /current_hash = calculated_hash/, 'Unchanged payloads must not create redundant revisions');
assert.match(sql, /actor_email[\s\S]*auth\.jwt\(\) ->> 'email'/, 'Audit writes must retain the authenticated actor email');
assert.match(sql, /portal_design_workspace_history[\s\S]*offset 100/i, 'Server history retention must be bounded');
assert.match(sql, /portal_design_workspace_audit[\s\S]*offset 2000/i, 'Server audit retention must be bounded');
assert.match(sql, /raw_app_meta_data ->> 'portal_role'/, 'Initial workspace membership must bootstrap from protected app metadata');
assert.match(sql, /create or replace function public\.restore_portal_design_workspace_revision/, 'Protected remote restore RPC must exist');
assert.match(sql, /grant execute on function public\.restore_portal_design_workspace_revision[^;]+to authenticated/i, 'Authenticated members must be able to invoke the restore RPC');

console.log('portal-designers-access-history.selftest: ok');
