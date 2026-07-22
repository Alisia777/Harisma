#!/usr/bin/env node
'use strict';

const DEFAULT_SUPABASE_URL = 'https://iyckwryrucqrxwlowxow.supabase.co';
const DEFAULT_BRAND = 'Алтея';
const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_BATCH_SIZE = 200;

function trim(value) {
  return String(value || '').trim();
}

function configFromEnv(env = process.env) {
  const supabaseUrl = trim(env.SUPABASE_URL || env.ALTEA_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
  const serviceRoleKey = trim(env.SUPABASE_SERVICE_ROLE_KEY || env.ALTEA_SUPABASE_SERVICE_ROLE_KEY);
  const brand = trim(env.ALTEA_DESIGN_WORKSPACE_BRAND || DEFAULT_BRAND);
  if (!supabaseUrl) throw new Error('SUPABASE_URL is required.');
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.');
  if (!brand) throw new Error('ALTEA_DESIGN_WORKSPACE_BRAND must not be empty.');
  return { supabaseUrl, serviceRoleKey, brand };
}

function desiredAccess(user) {
  const metadata = (user && user.app_metadata) || {};
  const portalRole = trim(metadata.portal_role || metadata.portalRole || metadata.role).toLowerCase();
  return metadata.portal_admin === true || portalRole === 'owner' || portalRole === 'designer' ? 'editor' : 'viewer';
}

function authHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json'
  };
}

async function requestJson(fetchImpl, url, options, label) {
  const response = await fetchImpl(url, options);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
  }
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
}

async function listAuthUsers(fetchImpl, config, pageSize = DEFAULT_PAGE_SIZE) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const url = `${config.supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=${pageSize}`;
    const payload = await requestJson(fetchImpl, url, { headers: authHeaders(config.serviceRoleKey) }, 'Auth user listing');
    const rows = payload && Array.isArray(payload.users) ? payload.users : [];
    users.push(...rows);
    if (rows.length < pageSize) break;
  }
  return users;
}

async function listMemberships(fetchImpl, config) {
  const query = new URLSearchParams({
    select: 'brand,user_id,access_level,managed_by_role',
    brand: `eq.${config.brand}`,
    limit: '10000'
  });
  const url = `${config.supabaseUrl}/rest/v1/portal_design_workspace_members?${query.toString()}`;
  const payload = await requestJson(fetchImpl, url, { headers: authHeaders(config.serviceRoleKey) }, 'Membership listing');
  return Array.isArray(payload) ? payload : [];
}

async function upsertMembershipBatch(fetchImpl, config, rows) {
  const url = `${config.supabaseUrl}/rest/v1/portal_design_workspace_members?on_conflict=brand%2Cuser_id`;
  const headers = authHeaders(config.serviceRoleKey);
  headers.Prefer = 'resolution=merge-duplicates,return=minimal';
  await requestJson(fetchImpl, url, {
    method: 'POST',
    headers,
    body: JSON.stringify(rows)
  }, 'Membership upsert');
}

async function syncMemberships(options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('A Fetch API implementation is required.');
  const config = options.config || configFromEnv(options.env || process.env);
  const pageSize = options.pageSize || DEFAULT_PAGE_SIZE;
  const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
  const now = options.now || new Date().toISOString();
  const [users, memberships] = await Promise.all([
    listAuthUsers(fetchImpl, config, pageSize),
    listMemberships(fetchImpl, config)
  ]);
  const existingByUser = new Map(memberships.map((row) => [String(row.user_id), row]));
  const rows = [];
  const summary = {
    brand: config.brand,
    users: users.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    manualPreserved: 0,
    upserted: 0
  };

  users.forEach((user) => {
    const userId = trim(user && user.id);
    if (!userId) return;
    const existing = existingByUser.get(userId);
    if (existing && existing.managed_by_role === false) {
      summary.manualPreserved += 1;
      return;
    }
    const accessLevel = desiredAccess(user);
    if (existing && existing.access_level === accessLevel) {
      summary.unchanged += 1;
      return;
    }
    if (existing) summary.updated += 1;
    else summary.created += 1;
    rows.push({
      brand: config.brand,
      user_id: userId,
      access_level: accessLevel,
      managed_by_role: true,
      updated_at: now
    });
  });

  for (let offset = 0; offset < rows.length; offset += batchSize) {
    await upsertMembershipBatch(fetchImpl, config, rows.slice(offset, offset + batchSize));
  }
  summary.upserted = rows.length;
  return summary;
}

async function main() {
  const summary = await syncMemberships();
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

module.exports = {
  configFromEnv,
  desiredAccess,
  listAuthUsers,
  listMemberships,
  syncMemberships
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exit(1);
  });
}
