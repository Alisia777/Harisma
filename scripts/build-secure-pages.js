#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, process.env.SECURE_PAGES_OUT_DIR || '_site');

const ROOT_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.mjs', '.svg', '.png', '.jpg', '.jpeg', '.webp',
  '.gif', '.avif', '.ico', '.webmanifest', '.mp4', '.webm', '.mov', '.ogg',
  '.mp3', '.wav', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.wasm'
]);
const ASSET_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.mjs', '.svg', '.png', '.jpg', '.jpeg', '.webp',
  '.gif', '.avif', '.ico', '.webmanifest', '.mp4', '.webm', '.mov', '.ogg',
  '.mp3', '.wav', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.wasm'
]);
const SKIP_ASSET_DIRECTORIES = new Set([
  '.git', '.github', '__tests__', 'backend', 'data', 'docs', 'fixtures',
  'node_modules', 'scripts', 'spec', 'specs', 'supabase', 'test', 'tests'
]);
const SPECIAL_ROOT_FILES = new Set(['CNAME', '.nojekyll']);
const REQUIRED_FILES = [
  'index.html',
  'portal-auth-access.js',
  'portal-auth-gate.js',
  'portal-authenticated-supabase-runtime.js',
  'portal-snapshot-transport.js',
  'portal-task-attachment-auth-hotfix.js'
];
const KNOWN_GUEST_PASSWORD = 'NihsS%Hn_uE#kXBfcX!e';

function ensureDirectory(target) {
  fs.mkdirSync(target, { recursive: true });
}

function writeText(relativePath, content) {
  const target = path.join(OUT, relativePath);
  ensureDirectory(path.dirname(target));
  fs.writeFileSync(target, content, 'utf8');
}

function copyFile(source, target) {
  ensureDirectory(path.dirname(target));
  fs.copyFileSync(source, target);
}

function allowedAssetFile(filePath) {
  return ASSET_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function copyAllowedTree(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) return;
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (SKIP_ASSET_DIRECTORIES.has(entry.name.toLowerCase())) continue;
      copyAllowedTree(source, target);
      continue;
    }
    if (entry.isFile() && allowedAssetFile(source)) copyFile(source, target);
  }
}

function copyRootBrowserFiles() {
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!SPECIAL_ROOT_FILES.has(entry.name) && !ROOT_EXTENSIONS.has(extension)) continue;
    copyFile(path.join(ROOT, entry.name), path.join(OUT, entry.name));
  }
  copyAllowedTree(path.join(ROOT, 'assets'), path.join(OUT, 'assets'));
}

function replaceRequired(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source) throw new Error(`Secure build transform did not match: ${label}`);
  return next;
}

function safeAccessRulesSource() {
  return `(function () {
  'use strict';

  var ALL_VIEWS = [
    'dashboard', 'data-health', 'control', 'executive', 'sku-plan-fact',
    'repricer', 'prices', 'order', 'oos-control', 'sku-contour', 'skus',
    'launches', 'iu-drr', 'wb-rating', 'product-leaderboard', 'meetings',
    'documents', 'designers'
  ];
  var EMPLOYEE_VIEWS = [
    'dashboard', 'data-health', 'control', 'executive', 'sku-plan-fact',
    'repricer', 'prices', 'order', 'oos-control', 'sku-contour', 'launches',
    'iu-drr', 'wb-rating', 'product-leaderboard', 'meetings', 'documents',
    'designers'
  ];

  // Client-side rules only shape navigation. Real access is enforced by
  // Supabase RLS/membership and by the outer identity proxy.
  window.ALTEA_PORTAL_ACCESS_RULES = {
    version: '2026-08-05-server-authorized',
    allViews: ALL_VIEWS,
    defaultViews: EMPLOYEE_VIEWS,
    enforceUserAllowlist: false,
    roles: {
      owner: { views: '*' },
      director: { views: ['dashboard', 'executive', 'control', 'documents', 'designers', 'sku-plan-fact', 'prices', 'order', 'product-leaderboard', 'iu-drr', 'wb-rating'] },
      marketplace: { views: ['dashboard', 'documents', 'designers', 'sku-plan-fact', 'repricer', 'prices', 'order', 'oos-control', 'iu-drr', 'wb-rating'] },
      product: { views: ['dashboard', 'data-health', 'documents', 'designers', 'sku-contour', 'launches', 'product-leaderboard', 'wb-rating'] },
      designer: { views: ['dashboard', 'control', 'documents', 'designers', 'data-health', 'sku-contour', 'launches', 'product-leaderboard', 'wb-rating'] },
      operations: { views: ['dashboard', 'control', 'documents', 'designers', 'order', 'oos-control', 'sku-plan-fact'] },
      employee: { views: EMPLOYEE_VIEWS },
      readonly: { views: ['dashboard', 'documents', 'designers'] },
      guest: { views: [] }
    },
    users: {}
  };
})();
`;
}

function sanitizeAuthGate() {
  const target = path.join(OUT, 'portal-auth-gate.js');
  let source = fs.readFileSync(target, 'utf8');
  source = replaceRequired(
    source,
    /var GUEST_EMAIL = '[^']*';/,
    "var GUEST_EMAIL = 'disabled-guest@invalid.local';",
    'guest email'
  );
  source = replaceRequired(
    source,
    /var GUEST_PASSWORD = '[^']*';/,
    "var GUEST_PASSWORD = '';",
    'guest password'
  );
  source = source.replace(
    /var GUEST_NAME = '[^']*';/,
    "var GUEST_NAME = 'Гостевой вход отключён';"
  );

  const disabledGuestBlock = `  function isGuestCredentials() {
    return false;
  }

  function buildGuestSession() {
    throw new Error('guest-access-disabled');
  }

  function signInGuest() {
    return Promise.reject(new Error('guest-access-disabled'));
  }
`;
  const guestStart = source.indexOf('  function isGuestCredentials(credentials) {');
  const guestEnd = source.indexOf('\n  function delay(ms) {', guestStart);
  if (guestStart < 0 || guestEnd < 0) throw new Error('Unable to remove guest-session implementation.');
  source = source.slice(0, guestStart) + disabledGuestBlock + source.slice(guestEnd);
  source = replaceRequired(
    source,
    '    guestLogin = isGuestCredentials(credentials);',
    '    guestLogin = false;',
    'guest login call'
  );
  source = source.replaceAll(KNOWN_GUEST_PASSWORD, 'guest-access-disabled');
  fs.writeFileSync(target, source, 'utf8');
}

function forceAuthenticatedPortalMode() {
  for (const entry of fs.readdirSync(OUT, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.js') continue;
    const filePath = path.join(OUT, entry.name);
    let source = fs.readFileSync(filePath, 'utf8');
    source = source.replace(/auth:\s*'anonymous'/g, "auth: 'email_password'");
    source = source.replaceAll('guest@qeep.life', 'disabled-guest@invalid.local');
    source = source.replaceAll(KNOWN_GUEST_PASSWORD, 'guest-access-disabled');
    fs.writeFileSync(filePath, source, 'utf8');
  }
}

function secureIndex() {
  const target = path.join(OUT, 'index.html');
  let source = fs.readFileSync(target, 'utf8');
  const runtimeTag = '  <script type="application/x-altea-auth-delayed" data-auth-src="portal-authenticated-supabase-runtime.js?v=20260805lockdown1"></script>\n';
  const marker = '  <script type="application/x-altea-auth-delayed" data-auth-src="portal-snapshot-transport.js';
  if (!source.includes('portal-authenticated-supabase-runtime.js')) {
    if (!source.includes(marker)) throw new Error('Snapshot transport marker not found in index.html.');
    source = source.replace(marker, runtimeTag + marker);
  }
  if (!/name=["']robots["']/i.test(source)) {
    source = source.replace('</head>', '  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">\n</head>');
  }
  fs.writeFileSync(target, source, 'utf8');
  fs.writeFileSync(path.join(OUT, '404.html'), source, 'utf8');
}

function assertReferencedFilesExist() {
  const index = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  const missing = [];
  const pattern = /(?:src|href)=["']([^"']+)["']/gi;
  for (let match = pattern.exec(index); match; match = pattern.exec(index)) {
    const raw = String(match[1] || '').trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('data:') || /^[a-z]+:\/\//i.test(raw) || raw.startsWith('mailto:')) continue;
    const local = raw.split(/[?#]/)[0].replace(/^\/+/, '');
    if (!local || !path.extname(local)) continue;
    if (!fs.existsSync(path.join(OUT, local))) missing.push(local);
  }
  if (missing.length) throw new Error(`Secure artifact is missing referenced files: ${[...new Set(missing)].join(', ')}`);
}

function writePlatformFiles() {
  writeText('.nojekyll', '');
  writeText('robots.txt', 'User-agent: *\nDisallow: /\n');
  writeText('_headers', `/*
  Cache-Control: private, no-store, max-age=0
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()

/assets/*
  Cache-Control: private, max-age=3600
`);
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

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

function writeManifest() {
  const files = listFiles(OUT).filter((file) => file !== '_secure-build-manifest.json');
  const manifest = {
    schema: 'altea-secure-portal-build-v1',
    generatedAt: new Date().toISOString(),
    files: files.map((file) => ({
      path: file,
      bytes: fs.statSync(path.join(OUT, file)).size,
      sha256: hashFile(path.join(OUT, file))
    }))
  };
  writeText('_secure-build-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  ensureDirectory(OUT);
  copyRootBrowserFiles();

  for (const required of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(OUT, required))) throw new Error(`Required browser file is missing: ${required}`);
  }

  writeText('portal-auth-access.js', safeAccessRulesSource());
  sanitizeAuthGate();
  forceAuthenticatedPortalMode();
  secureIndex();
  writePlatformFiles();
  assertReferencedFilesExist();
  writeManifest();

  const files = listFiles(OUT);
  process.stdout.write(`secure portal artifact: ${files.length} files in ${path.relative(ROOT, OUT)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exit(1);
  }
}

module.exports = { main, safeAccessRulesSource };
