#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, process.env.SECURE_PAGES_OUT_DIR || '_site');
const TEXT_EXTENSIONS = new Set(['.html', '.css', '.js', '.mjs']);
const BROWSER_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.mjs', '.svg', '.png', '.jpg', '.jpeg', '.webp',
  '.gif', '.avif', '.ico', '.webmanifest', '.mp4', '.webm', '.mov', '.ogg',
  '.mp3', '.wav', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.wasm'
]);
const ALWAYS_KEEP = new Set([
  'index.html', '404.html', 'CNAME', '.nojekyll', '_headers', 'robots.txt',
  'portal-authenticated-supabase-runtime.js'
]);
const KNOWN_GUEST_PASSWORD = 'NihsS%Hn_uE#kXBfcX!e';

function listFiles(root, prefix = '') {
  const rows = [];
  if (!fs.existsSync(root)) return rows;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) rows.push(...listFiles(absolute, relative));
    else if (entry.isFile()) rows.push(relative);
  }
  return rows.sort();
}

function normalizeReference(rawValue, fromRelative) {
  let raw = String(rawValue || '').trim();
  if (!raw || raw.startsWith('#') || raw.startsWith('//')) return '';
  if (/^(?:https?:|data:|blob:|mailto:|tel:|javascript:)/i.test(raw)) return '';
  raw = raw.split('#')[0].split('?')[0].replace(/\\+/g, '/').trim();
  if (!raw) return '';

  const base = raw.startsWith('/')
    ? raw.replace(/^\/+/, '')
    : path.posix.join(path.posix.dirname(fromRelative || 'index.html'), raw);
  const normalized = path.posix.normalize(base).replace(/^\.\//, '');
  if (!normalized || normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return '';
  if (!BROWSER_EXTENSIONS.has(path.extname(normalized).toLowerCase())) return '';
  if (!fs.existsSync(path.join(OUT, normalized)) || !fs.statSync(path.join(OUT, normalized)).isFile()) return '';
  return normalized;
}

function extractReferences(source, fromRelative) {
  const found = new Set();
  const patterns = [
    /(?:src|href|data-auth-src)=["']([^"']+)["']/gi,
    /["'`]((?!https?:|data:|blob:|\/\/|#)[^"'`\s<>]+?\.(?:html|css|js|mjs|svg|png|jpe?g|webp|gif|avif|ico|webmanifest|mp4|webm|mov|ogg|mp3|wav|woff2?|ttf|otf|eot|wasm)(?:\?[^"'`]*)?)["'`]/gi,
    /url\(\s*["']?([^"')]+)["']?\s*\)/gi
  ];
  for (const pattern of patterns) {
    for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
      const normalized = normalizeReference(match[1], fromRelative);
      if (normalized) found.add(normalized);
    }
  }
  return found;
}

function sanitizeApplicationJavaScript() {
  for (const relative of listFiles(OUT)) {
    if (path.extname(relative).toLowerCase() !== '.js') continue;
    if (relative.startsWith('assets/vendor/')) continue;
    const absolute = path.join(OUT, relative);
    let source = fs.readFileSync(absolute, 'utf8');
    source = source.replace(/auth:\s*'anonymous'/g, "auth: 'email_password'");
    source = source.replaceAll('guest@qeep.life', 'disabled-guest@invalid.local');
    source = source.replaceAll('name@qeep.life', 'name@company.example');
    source = source.replaceAll(KNOWN_GUEST_PASSWORD, 'guest-access-disabled');
    source = source.replace(
      /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.auth\.signInAnonymously\(\)/g,
      "Promise.reject(new Error('anonymous-access-disabled'))"
    );
    fs.writeFileSync(absolute, source, 'utf8');
  }
}

function dependencyClosure() {
  const keep = new Set();
  const queue = [];

  for (const relative of ALWAYS_KEEP) {
    if (!fs.existsSync(path.join(OUT, relative))) continue;
    keep.add(relative);
    if (TEXT_EXTENSIONS.has(path.extname(relative).toLowerCase())) queue.push(relative);
  }

  while (queue.length) {
    const relative = queue.shift();
    if (relative.startsWith('assets/vendor/')) continue;
    const absolute = path.join(OUT, relative);
    if (!fs.existsSync(absolute)) continue;
    const source = fs.readFileSync(absolute, 'utf8');
    for (const dependency of extractReferences(source, relative)) {
      if (keep.has(dependency)) continue;
      keep.add(dependency);
      if (TEXT_EXTENSIONS.has(path.extname(dependency).toLowerCase())) queue.push(dependency);
    }
  }

  return keep;
}

function removeEmptyDirectories(root) {
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = path.join(root, entry.name);
    removeEmptyDirectories(child);
    if (!fs.readdirSync(child).length) fs.rmdirSync(child);
  }
}

function pruneUnreferencedFiles() {
  const keep = dependencyClosure();
  for (const relative of listFiles(OUT)) {
    if (relative === '_secure-build-manifest.json') {
      fs.rmSync(path.join(OUT, relative), { force: true });
      continue;
    }
    if (!keep.has(relative)) fs.rmSync(path.join(OUT, relative), { force: true });
  }
  removeEmptyDirectories(OUT);
  return keep;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeManifest() {
  const files = listFiles(OUT).filter((file) => file !== '_secure-build-manifest.json');
  const manifest = {
    schema: 'altea-secure-portal-build-v2',
    generatedAt: new Date().toISOString(),
    files: files.map((file) => ({
      path: file,
      bytes: fs.statSync(path.join(OUT, file)).size,
      sha256: sha256(path.join(OUT, file))
    }))
  };
  fs.writeFileSync(path.join(OUT, '_secure-build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

function main() {
  if (!fs.existsSync(path.join(OUT, 'index.html'))) {
    throw new Error(`Secure build output is missing: ${path.join(OUT, 'index.html')}`);
  }
  const before = listFiles(OUT).length;
  sanitizeApplicationJavaScript();
  const keep = pruneUnreferencedFiles();
  writeManifest();
  const after = listFiles(OUT).length;
  process.stdout.write(`secure portal prune: ${before} -> ${after} files (${keep.size} runtime dependencies)\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exit(1);
  }
}

module.exports = { dependencyClosure, extractReferences, main, normalizeReference };
