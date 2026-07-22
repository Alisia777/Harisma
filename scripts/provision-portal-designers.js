#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_SUPABASE_URL = 'https://iyckwryrucqrxwlowxow.supabase.co';
const DEFAULT_REDIRECT_URL = 'https://харизмой.рф/';
const DEFAULT_ACCOUNTS = path.resolve(__dirname, '..', 'data', 'designers_onboarding_accounts.json');

function text(value) {
  return String(value == null ? '' : value).trim();
}

function configFromEnv(env = process.env) {
  const supabaseUrl = text(env.SUPABASE_URL || env.ALTEA_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
  const serviceRoleKey = text(env.SUPABASE_SERVICE_ROLE_KEY || env.ALTEA_SUPABASE_SERVICE_ROLE_KEY);
  const redirectUrl = text(env.PORTAL_AUTH_REDIRECT_URL || DEFAULT_REDIRECT_URL);
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.');
  return { supabaseUrl, serviceRoleKey, redirectUrl };
}

function headers(config) {
  return { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, 'Content-Type': 'application/json' };
}

async function requestJson(fetchImpl, url, options, label) {
  const response = await fetchImpl(url, options);
  const body = await response.text();
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
  return body ? JSON.parse(body) : null;
}

async function listUsers(fetchImpl, config, pageSize = 1000) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const payload = await requestJson(fetchImpl, `${config.supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=${pageSize}`, { headers: headers(config) }, 'Auth user listing');
    const rows = payload && Array.isArray(payload.users) ? payload.users : [];
    users.push(...rows);
    if (rows.length < pageSize) break;
  }
  return users;
}

async function updatePortalMetadata(fetchImpl, config, user, account) {
  const appMetadata = { ...((user && user.app_metadata) || {}), portal_role: account.role || 'designer' };
  const userMetadata = { ...((user && user.user_metadata) || {}), name: account.name || account.email };
  return requestJson(fetchImpl, `${config.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
    method: 'PUT', headers: headers(config), body: JSON.stringify({ app_metadata: appMetadata, user_metadata: userMetadata })
  }, `Portal metadata for ${account.email}`);
}

async function inviteUser(fetchImpl, config, account) {
  const query = new URLSearchParams({ redirect_to: config.redirectUrl });
  const payload = await requestJson(fetchImpl, `${config.supabaseUrl}/auth/v1/invite?${query}`, {
    method: 'POST', headers: headers(config), body: JSON.stringify({ email: account.email, data: { name: account.name || account.email } })
  }, `Invite for ${account.email}`);
  return payload && payload.user ? payload.user : payload;
}

async function sendPasswordSetup(fetchImpl, config, account) {
  const query = new URLSearchParams({ redirect_to: config.redirectUrl });
  await requestJson(fetchImpl, `${config.supabaseUrl}/auth/v1/recover?${query}`, {
    method: 'POST', headers: headers(config), body: JSON.stringify({ email: account.email })
  }, `Password setup for ${account.email}`);
}

async function provisionAccounts(options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  const config = options.config || configFromEnv(options.env || process.env);
  const source = options.source || JSON.parse(fs.readFileSync(options.input || DEFAULT_ACCOUNTS, 'utf8'));
  const accounts = Array.isArray(source.accounts) ? source.accounts.map((account) => ({
    email: text(account.email).toLowerCase(), name: text(account.name), role: text(account.role || 'designer').toLowerCase()
  })).filter((account) => account.email) : [];
  if (!accounts.length) throw new Error('No onboarding accounts configured.');
  const users = await listUsers(fetchImpl, config, options.pageSize || 1000);
  const byEmail = new Map(users.map((user) => [text(user.email).toLowerCase(), user]));
  const summary = { requested: accounts.length, invited: 0, passwordSetupSent: 0, metadataUpdated: 0 };

  for (const account of accounts) {
    let user = byEmail.get(account.email);
    if (!user) {
      user = await inviteUser(fetchImpl, config, account);
      if (!user || !user.id) throw new Error(`Invite for ${account.email} did not return a user id.`);
      summary.invited += 1;
    } else {
      await sendPasswordSetup(fetchImpl, config, account);
      summary.passwordSetupSent += 1;
    }
    await updatePortalMetadata(fetchImpl, config, user, account);
    summary.metadataUpdated += 1;
  }
  return summary;
}

module.exports = { configFromEnv, provisionAccounts };

if (require.main === module) {
  provisionAccounts().then((summary) => process.stdout.write(`${JSON.stringify(summary)}\n`)).catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exit(1);
  });
}
