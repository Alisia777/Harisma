#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_SUPABASE_URL = 'https://iyckwryrucqrxwlowxow.supabase.co';

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--append') {
      args.append = true;
      continue;
    }
    const [rawKey, inlineValue] = token.split('=');
    if (!rawKey.startsWith('--')) continue;
    const key = rawKey.replace(/^--/, '');
    const nextValue = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = nextValue;
  }
  return args;
}

function normalizeText(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function isoDate(value) {
  const raw = normalizeText(value, 80);
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date: ${raw}`);
  return parsed.toISOString();
}

function resolveOptions(args) {
  const supabaseKey = normalizeText(
    args['supabase-key']
      || process.env.ALTEA_SUPABASE_SERVICE_ROLE_KEY
      || process.env.ALTEA_SECURITY_AUDIT_EXPORT_KEY
      || '',
    1000
  );
  return {
    supabaseUrl: normalizeText(args['supabase-url'] || process.env.ALTEA_SUPABASE_URL || DEFAULT_SUPABASE_URL, 500),
    supabaseKey,
    since: isoDate(args.since || process.env.ALTEA_SECURITY_AUDIT_EXPORT_SINCE || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    limit: Math.max(1, Math.min(10000, Number(args.limit || 1000) || 1000)),
    eventType: normalizeText(args['event-type'] || '', 80),
    outFile: normalizeText(args.out || args.output || '', 1000),
    append: Boolean(args.append),
    format: normalizeText(args.format || 'ndjson', 20).toLowerCase()
  };
}

async function fetchAuditRows(options) {
  if (!options.supabaseKey) {
    throw new Error('Set ALTEA_SUPABASE_SERVICE_ROLE_KEY or pass --supabase-key for audit export.');
  }
  if (typeof fetch !== 'function') {
    throw new Error('This script requires Node.js with global fetch support.');
  }

  const url = new URL(`${options.supabaseUrl.replace(/\/+$/, '')}/rest/v1/portal_security_audit_events`);
  url.searchParams.set('select', '*');
  url.searchParams.set('received_at', `gt.${options.since}`);
  url.searchParams.set('order', 'received_at.asc');
  url.searchParams.set('limit', String(options.limit));
  if (options.eventType) url.searchParams.set('event_type', `eq.${options.eventType}`);

  const response = await fetch(url.toString(), {
    headers: {
      apikey: options.supabaseKey,
      Authorization: `Bearer ${options.supabaseKey}`,
      Accept: 'application/json'
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase audit export failed: HTTP ${response.status} ${text.slice(0, 700)}`);
  }
  return text ? JSON.parse(text) : [];
}

function rowToWazuhEvent(row) {
  return {
    integration: 'altea-portal',
    event_id: row.event_id || row.id,
    event_type: row.event_type,
    outcome: row.outcome,
    severity: row.severity,
    source: row.source,
    actor_email: row.actor_email,
    actor_user_id: row.actor_user_id,
    actor_role: row.actor_role,
    target_type: row.target_type,
    target_id: row.target_id,
    target_name: row.target_name,
    srcip: row.ip_address || '',
    user_agent: row.user_agent || '',
    metadata: row.metadata || {},
    occurred_at: row.occurred_at,
    received_at: row.received_at
  };
}

function renderRows(rows, format) {
  const events = rows.map(rowToWazuhEvent);
  if (format === 'json') return `${JSON.stringify(events, null, 2)}\n`;
  return `${events.map((event) => JSON.stringify(event)).join('\n')}${events.length ? '\n' : ''}`;
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const rows = await fetchAuditRows(options);
  const rendered = renderRows(rows, options.format);
  if (options.outFile) {
    fs.mkdirSync(path.dirname(path.resolve(options.outFile)), { recursive: true });
    if (options.append) fs.appendFileSync(options.outFile, rendered, 'utf8');
    else fs.writeFileSync(options.outFile, rendered, 'utf8');
  } else {
    process.stdout.write(rendered);
  }
  console.error(`[portal-security-audit-export] exported ${rows.length} rows since ${options.since}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}
