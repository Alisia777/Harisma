#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, process.env.SECURE_PAGES_OUT_DIR || '_site');
const KNOWN_GUEST_PASSWORD = 'NihsS%Hn_uE#kXBfcX!e';
const FORBIDDEN_EXTENSIONS = new Set([
  '.md', '.sql', '.csv', '.tsv', '.xlsx', '.xls', '.xlsm', '.doc', '.docx',
  '.ppt', '.pptx', '.pdf', '.zip', '.7z', '.rar', '.txt', '.log', '.env',
  '.map', '.pem', '.key', '.p12', '.pfx'
]);
const ALLOWED_FORBIDDEN_FILES = new Set(['robots.txt']);
const FORBIDDEN_SEGMENTS = new Set([
  '.git', '.github', 'data', 'docs', 'scripts', 'tests', 'test', 'backend',
  'node_modules', 'supabase'
]);
const ALLOWED_JSON = new Set(['_secure-build-manifest.json']);

function listFiles(root, prefix = '') {
  const rows = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) rows.push(...listFiles(absolute, relative));
    else if (entry.isFile()) rows.push(relative);
  }
  return rows.sort();
}

function read(relativePath) {
  return fs.readFileSync(path.join(OUT, relativePath), 'utf8');
}

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

function main() {
  const failures = [];
  assert(fs.existsSync(OUT), `Secure output directory does not exist: ${OUT}`, failures);
  if (failures.length) throw new Error(failures.join('\n'));

  const files = listFiles(OUT);
  assert(files.length > 20, 'Secure artifact is unexpectedly small.', failures);

  for (const file of files) {
    const segments = file.split('/').map((segment) => segment.toLowerCase());
    const extension = path.extname(file).toLowerCase();
    const lower = file.toLowerCase();
    if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) {
      failures.push(`Forbidden directory leaked into artifact: ${file}`);
    }
    if (FORBIDDEN_EXTENSIONS.has(extension) && !ALLOWED_FORBIDDEN_FILES.has(file)) {
      failures.push(`Forbidden file type leaked into artifact: ${file}`);
    }
    if (extension === '.json' && !ALLOWED_JSON.has(file)) {
      failures.push(`Runtime/business JSON leaked into artifact: ${file}`);
    }
    if (lower.includes('.env') || lower.includes('service-role') || lower.includes('service_role')) {
      failures.push(`Secret-shaped path leaked into artifact: ${file}`);
    }
  }

  for (const required of [
    'index.html',
    '404.html',
    'portal-auth-access.js',
    'portal-auth-gate.js',
    'portal-authenticated-supabase-runtime.js',
    'portal-task-attachment-auth-hotfix.js',
    '_headers',
    'robots.txt'
  ]) {
    assert(files.includes(required), `Required secure artifact file is missing: ${required}`, failures);
  }

  const index = read('index.html');
  const accessRules = read('portal-auth-access.js');
  const authGate = read('portal-auth-gate.js');
  const authenticatedRuntime = read('portal-authenticated-supabase-runtime.js');
  const attachmentAuth = read('portal-task-attachment-auth-hotfix.js');
  const combinedJs = files
    .filter((file) => path.extname(file).toLowerCase() === '.js')
    .map((file) => read(file))
    .join('\n');

  const runtimeIndex = index.indexOf('portal-authenticated-supabase-runtime.js');
  const appCoreIndex = index.indexOf('app-core-01.js');
  assert(runtimeIndex >= 0, 'Authenticated Supabase runtime is not loaded.', failures);
  assert(appCoreIndex >= 0, 'Core portal script is not referenced.', failures);
  assert(runtimeIndex >= 0 && appCoreIndex >= 0 && runtimeIndex < appCoreIndex,
    'Authenticated Supabase runtime must load before app-core-01.js.', failures);
  assert(/name=["']robots["'][^>]+noindex/i.test(index), 'Internal portal is missing noindex metadata.', failures);

  assert(/enforceUserAllowlist:\s*false/.test(accessRules), 'Built navigation rules are not server-authorized.', failures);
  assert(/users:\s*\{\s*\}/.test(accessRules), 'Employee email allowlist leaked into browser bundle.', failures);
  assert(!/@qeep\.life/i.test(accessRules), 'Employee email leaked into portal-auth-access.js.', failures);
  assert(/guest:\s*\{\s*views:\s*\[\s*\]\s*\}/.test(accessRules), 'Guest role is not disabled.', failures);

  assert(/guestLogin\s*=\s*false;/.test(authGate), 'Guest login branch is still active.', failures);
  assert(!authGate.includes(KNOWN_GUEST_PASSWORD), 'Hard-coded guest password leaked into auth gate.', failures);
  assert(!/guest@qeep\.life/i.test(authGate), 'Guest email leaked into auth gate.', failures);
  assert(!/signInAnonymously\s*\(/.test(authGate), 'Anonymous Supabase login remains in auth gate.', failures);
  assert(!/guest-local-session/.test(authGate), 'Local guest session fallback remains in auth gate.', failures);

  assert(/window\.fetch\s*=\s*function authenticatedSupabaseFetch/.test(authenticatedRuntime),
    'Authenticated fetch wrapper is missing.', failures);
  assert(/createSignedUrl/.test(authenticatedRuntime), 'Private storage signed URL support is missing.', failures);
  assert(/guest-local-session/.test(authenticatedRuntime),
    'Runtime does not explicitly reject legacy local guest tokens.', failures);

  assert(!/signInAnonymously\s*\(/.test(attachmentAuth),
    'Attachment compatibility layer can still create anonymous users.', failures);
  assert(!/anon_key_fallback/.test(attachmentAuth),
    'Attachment compatibility layer still contains anon fallback.', failures);
  assert(/requireAuthenticatedSession/.test(attachmentAuth),
    'Attachment compatibility layer does not require a real session.', failures);

  assert(!combinedJs.includes(KNOWN_GUEST_PASSWORD), 'Known guest password leaked elsewhere in JavaScript.', failures);
  assert(!/auth:\s*'anonymous'/.test(combinedJs), 'Anonymous portal mode remains in built JavaScript.', failures);

  assert(!fs.existsSync(path.join(OUT, 'data')), 'Business data directory exists in secure artifact.', failures);
  assert(!fs.existsSync(path.join(OUT, 'docs')), 'Internal docs directory exists in secure artifact.', failures);
  assert(!fs.existsSync(path.join(OUT, 'scripts')), 'Build scripts directory exists in secure artifact.', failures);

  if (failures.length) {
    process.stderr.write('SECURE PORTAL AUDIT FAILED\n');
    failures.forEach((failure) => process.stderr.write(`- ${failure}\n`));
    process.exit(1);
  }

  process.stdout.write(`secure portal audit: ok (${files.length} files)\n`);
}

if (require.main === module) main();

module.exports = { main };
