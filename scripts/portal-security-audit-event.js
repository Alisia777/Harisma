#!/usr/bin/env node

const DEFAULT_SUPABASE_URL = 'https://iyckwryrucqrxwlowxow.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_PztMtkcraVy_A2ymze1Unw_I1rOjrlw';
const DEFAULT_BRAND = '\u0410\u043b\u0442\u0435\u044f';
const MAX_META_DEPTH = 4;
const MAX_META_KEYS = 50;
const MAX_META_STRING = 900;

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
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
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function isSecretKey(key) {
  return /(password|passwd|token|secret|apikey|api_key|authorization|access[_-]?token|refresh[_-]?token|bearer)/i.test(String(key || ''));
}

function scrubMetadata(value, depth = 0, keyName = '') {
  if (isSecretKey(keyName)) return '[redacted]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return normalizeText(value, MAX_META_STRING);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= MAX_META_DEPTH) return '[truncated]';
  if (Array.isArray(value)) {
    const output = value.slice(0, 40).map((item) => scrubMetadata(item, depth + 1, keyName));
    if (value.length > output.length) output.push('[truncated]');
    return output;
  }
  if (typeof value === 'object') {
    const output = {};
    const keys = Object.keys(value);
    keys.slice(0, MAX_META_KEYS).forEach((key) => {
      output[normalizeText(key, 80)] = scrubMetadata(value[key], depth + 1, key);
    });
    if (keys.length > MAX_META_KEYS) output.truncatedKeys = keys.length - MAX_META_KEYS;
    return output;
  }
  return normalizeText(value, MAX_META_STRING);
}

function resolveOptions(input = {}) {
  return {
    supabaseUrl: normalizeText(input.supabaseUrl || input['supabase-url'] || process.env.ALTEA_SUPABASE_URL || DEFAULT_SUPABASE_URL, 500),
    supabaseKey: normalizeText(
      input.supabaseKey
        || input['supabase-key']
        || process.env.ALTEA_SECURITY_AUDIT_KEY
        || process.env.ALTEA_SUPABASE_KEY
        || DEFAULT_SUPABASE_KEY,
      1000
    ),
    disabled: ['1', 'true', 'yes', 'on'].includes(normalizeText(input.disabled || process.env.ALTEA_SECURITY_AUDIT_DISABLED).toLowerCase())
  };
}

async function emitSecurityAudit(event, optionsInput = {}) {
  const options = resolveOptions(optionsInput);
  const eventType = normalizeText(event.eventType || event.event_type || event.type, 80);
  const metadata = scrubMetadata({
    brand: event.brand || process.env.ALTEA_PORTAL_BRAND || DEFAULT_BRAND,
    hostname: process.env.COMPUTERNAME || process.env.HOSTNAME || '',
    pid: process.pid,
    ...(event.metadata || {})
  });
  const body = {
    p_event_type: eventType,
    p_outcome: normalizeText(event.outcome || 'ok', 24),
    p_severity: normalizeText(event.severity || 'info', 24),
    p_actor_email: normalizeText(event.actorEmail || event.actor_email || process.env.ALTEA_AUDIT_ACTOR_EMAIL || '', 254),
    p_actor_role: normalizeText(event.actorRole || event.actor_role || '', 120),
    p_source: normalizeText(event.source || 'portal-node', 80),
    p_session_id: normalizeText(event.sessionId || event.session_id || process.env.ALTEA_AUDIT_SESSION_ID || '', 120),
    p_target_type: normalizeText(event.targetType || event.target_type || '', 80),
    p_target_id: normalizeText(event.targetId || event.target_id || '', 200),
    p_target_name: normalizeText(event.targetName || event.target_name || '', 240),
    p_metadata: metadata
  };

  if (options.disabled) return { skipped: true, reason: 'disabled' };
  if (!eventType) return { skipped: true, reason: 'missing-event-type' };
  if (!options.supabaseUrl || !options.supabaseKey) return { skipped: true, reason: 'missing-supabase-config' };
  if (typeof fetch !== 'function') return { skipped: true, reason: 'fetch-unavailable' };

  const response = await fetch(`${options.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/portal_audit_write`, {
    method: 'POST',
    headers: {
      apikey: options.supabaseKey,
      Authorization: `Bearer ${options.supabaseKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase audit write failed: HTTP ${response.status} ${text.slice(0, 500)}`);
  }
  return { ok: true, status: response.status, id: text ? JSON.parse(text) : null };
}

async function main() {
  const args = parseArgs(process.argv);
  const metadata = args['metadata-json'] ? JSON.parse(args['metadata-json']) : {};
  const result = await emitSecurityAudit({
    eventType: args['event-type'] || args.event || args.type,
    outcome: args.outcome || 'ok',
    severity: args.severity || 'info',
    actorEmail: args['actor-email'] || '',
    actorRole: args['actor-role'] || '',
    source: args.source || 'portal-node-cli',
    sessionId: args['session-id'] || '',
    targetType: args['target-type'] || '',
    targetId: args['target-id'] || '',
    targetName: args['target-name'] || '',
    metadata
  }, args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

module.exports = {
  emitSecurityAudit,
  scrubMetadata
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}
